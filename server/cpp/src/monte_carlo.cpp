#include <iostream>
#include <vector>
#include <cmath>
#include <random>
#include <chrono>
#include <thread>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <array>
#include <numeric> // For std::accumulate
#include <memory>  // For std::unique_ptr

// Batch size for random number generation - increased for better cache utilization
constexpr int RANDOM_BATCH_SIZE = 4096;

// Use aligned memory allocation for better performance with SIMD instructions
#if defined(__GNUC__) || defined(__clang__)
#define ALIGN_DATA(x) __attribute__((aligned(x)))
#else
#define ALIGN_DATA(x) __declspec(align(x))
#endif

// Force inline for critical functions to reduce function call overhead
#if defined(__GNUC__) || defined(__clang__)
#define FORCE_INLINE __attribute__((always_inline)) inline
#else
#define FORCE_INLINE __forceinline
#endif

// Structure to hold benchmark results
struct BenchmarkResult
{
    double executionTime;
    double optionPrice;
    double lowerBound;
    double upperBound;
    int threadsUsed;
};

// Force inline function to calculate payoff (minimize function call overhead)
FORCE_INLINE double calculate_payoff(double ST, double K, bool isCall)
{
    // Branchless version to avoid branch prediction failures
    const double call_payoff = ST - K;
    const double put_payoff = K - ST;
    const double call_result = call_payoff > 0.0 ? call_payoff : 0.0;
    const double put_result = put_payoff > 0.0 ? put_payoff : 0.0;
    return isCall ? call_result : put_result;
}

// Function to calculate option price using Monte Carlo simulation
void monte_carlo_black_scholes(double S0, double K, double r, double sigma,
                               double T, bool isCall, int numTrials,
                               double &price, double &lower, double &upper)
{
    // Validate inputs
    if (S0 <= 0.0)
    {
        throw std::invalid_argument("Stock price (S0) must be positive");
    }
    if (K <= 0.0)
    {
        throw std::invalid_argument("Strike price (K) must be positive");
    }
    if (sigma <= 0.0)
    {
        throw std::invalid_argument("Volatility (sigma) must be positive");
    }
    if (T <= 0.0)
    {
        throw std::invalid_argument("Time to maturity (T) must be positive");
    }
    if (numTrials <= 0)
    {
        throw std::invalid_argument("Number of trials must be positive");
    }

    // Pre-allocate memory outside of calculation loop with alignment for SIMD
    ALIGN_DATA(64)
    std::vector<double> payoffs(numTrials);

    // Initialize random number generator once with a good seed
    std::mt19937_64 gen(std::random_device{}()); // Use 64-bit Mersenne Twister for better quality
    std::normal_distribution<> norm_dist(0.0, 1.0);

    // Pre-calculate constants to reduce operations in the loop
    const double drift = (r - 0.5 * sigma * sigma) * T;
    const double volatility = sigma * sqrt(T);
    const double discount = exp(-r * T);

    // Pre-generate batch of random numbers with alignment for SIMD
    ALIGN_DATA(64)
    std::vector<double> random_numbers(RANDOM_BATCH_SIZE);

    // Calculate each path with aggressive loop unrolling (8 at a time)
    int i = 0;
    while (i < numTrials)
    {
        // Refill random number batch when needed
        if (i % RANDOM_BATCH_SIZE == 0)
        {
            for (int j = 0; j < RANDOM_BATCH_SIZE && i + j < numTrials; ++j)
            {
                random_numbers[j] = norm_dist(gen);
            }
        }

        // Process 8 paths at once (more aggressive loop unrolling)
        const int batch_end = std::min(i + 8, numTrials);
        for (int j = i; j < batch_end; ++j)
        {
            // Get random number from pre-generated batch
            const double z = random_numbers[j % RANDOM_BATCH_SIZE];

            // Calculate stock price at maturity (minimizing operations)
            const double ST = S0 * exp(drift + volatility * z);

            // Calculate payoff using inline function
            payoffs[j] = calculate_payoff(ST, K, isCall);
        }
        i = batch_end;
    }

    // Calculate the average payoff using std::accumulate for better optimization
    double sum = std::accumulate(payoffs.begin(), payoffs.end(), 0.0);
    double mean = sum / numTrials;
    double discounted_mean = mean * discount;

    // Calculate variance and standard deviation with optimized loop
    double variance = 0.0;
    for (const auto &payoff : payoffs)
    {
        double diff = payoff - mean;
        variance += diff * diff; // Avoid pow() function call
    }
    variance /= (numTrials - 1);
    double std_dev = sqrt(variance);

    // Calculate 95% confidence interval (1.96 is the z-score for 95% confidence)
    double margin_of_error = 1.96 * (std_dev / sqrt(numTrials)) * discount;

    // Set output values
    price = discounted_mean;
    lower = discounted_mean - margin_of_error;
    upper = discounted_mean + margin_of_error;
}

// Thread-local storage for intermediate results with alignment
thread_local ALIGN_DATA(64) std::vector<double> thread_local_payoffs;

// Multi-threaded version for better performance
void monte_carlo_black_scholes_mt(double S0, double K, double r, double sigma,
                                  double T, bool isCall, int numTrials, int num_threads,
                                  double &price, double &lower, double &upper)
{
    // Validate inputs
    if (S0 <= 0.0)
    {
        throw std::invalid_argument("Stock price (S0) must be positive");
    }
    if (K <= 0.0)
    {
        throw std::invalid_argument("Strike price (K) must be positive");
    }
    if (sigma <= 0.0)
    {
        throw std::invalid_argument("Volatility (sigma) must be positive");
    }
    if (T <= 0.0)
    {
        throw std::invalid_argument("Time to maturity (T) must be positive");
    }
    if (numTrials <= 0)
    {
        throw std::invalid_argument("Number of trials must be positive");
    }

    // Determine number of threads to use
    if (num_threads <= 0)
    {
        num_threads = std::thread::hardware_concurrency();
        if (num_threads == 0)
            num_threads = 4; // Default to 4 if can't determine
    }

    // Ensure we don't use more threads than trials
    num_threads = std::min(num_threads, numTrials);

    // Calculate trials per thread - ensure even distribution
    int trials_per_thread = numTrials / num_threads;
    int remaining_trials = numTrials % num_threads;

    // Pre-calculate constants to reduce operations in the loop
    const double drift = (r - 0.5 * sigma * sigma) * T;
    const double volatility = sigma * sqrt(T);
    const double discount = exp(-r * T);

    // Structure to hold thread-local statistical accumulators
    struct ThreadResult
    {
        double sum;
        double sum_squared;
        int count;
    };

    // Vector to store thread results (much smaller than storing all payoffs)
    std::vector<ThreadResult> thread_results(num_threads, {0.0, 0.0, 0});

    // Pre-allocate thread vector
    std::vector<std::thread> threads;
    threads.reserve(num_threads);

    // Function to be executed by each thread
    auto thread_func = [&](int thread_id, int start_trial, int end_trial)
    {
        // Initialize thread-local accumulators
        double local_sum = 0.0;
        double local_sum_squared = 0.0;
        int local_count = 0;

        // Initialize random number generator for this thread
        std::mt19937_64 gen(std::chrono::high_resolution_clock::now().time_since_epoch().count() + thread_id); // Better seed
        std::normal_distribution<> norm_dist(0.0, 1.0);

        // Pre-generate batch of random numbers - use array for stack allocation
        ALIGN_DATA(64)
        std::array<double, RANDOM_BATCH_SIZE> random_numbers;
        int random_index = RANDOM_BATCH_SIZE; // Force initial generation

        // Calculate paths for this thread with aggressive loop unrolling
        int i = start_trial;
        while (i < end_trial)
        {
            // Refill random number batch when needed
            if (random_index >= RANDOM_BATCH_SIZE)
            {
                for (int j = 0; j < RANDOM_BATCH_SIZE; ++j)
                {
                    random_numbers[j] = norm_dist(gen);
                }
                random_index = 0;
            }

            // Process multiple paths at once (aggressive loop unrolling - 8 at a time)
            const int batch_end = std::min(i + 8, end_trial);
            for (; i < batch_end; ++i, ++random_index)
            {
                // Get random number from pre-generated batch
                const double z = random_numbers[random_index];

                // Calculate stock price at maturity (minimizing operations)
                const double ST = S0 * exp(drift + volatility * z);

                // Calculate payoff using inline function
                const double payoff = calculate_payoff(ST, K, isCall);

                // Update local accumulators directly
                local_sum += payoff;
                local_sum_squared += payoff * payoff;
                local_count++;
            }
        }

        // Store thread results (only 3 values, not an entire vector)
        thread_results[thread_id] = {local_sum, local_sum_squared, local_count};
    };

    // Launch threads with better work distribution
    int start_trial = 0;
    for (int i = 0; i < num_threads; i++)
    {
        int thread_trials = trials_per_thread + (i < remaining_trials ? 1 : 0);
        int end_trial = start_trial + thread_trials;
        threads.emplace_back(thread_func, i, start_trial, end_trial);
        start_trial = end_trial;
    }

    // Wait for all threads to complete
    for (auto &thread : threads)
    {
        thread.join();
    }

    // Combine results from all threads (much faster now)
    double total_sum = 0.0;
    double total_sum_squared = 0.0;
    int total_count = 0;

    for (const auto &result : thread_results)
    {
        total_sum += result.sum;
        total_sum_squared += result.sum_squared;
        total_count += result.count;
    }

    // Calculate mean
    double mean = total_sum / total_count;
    double discounted_mean = mean * discount;

    // Calculate variance using E[X²] - (E[X])²
    double variance = (total_sum_squared / total_count) - (mean * mean);
    double std_dev = sqrt(variance);

    // Calculate 95% confidence interval
    double margin_of_error = 1.96 * (std_dev / sqrt(total_count)) * discount;

    // Set output values
    price = discounted_mean;
    lower = discounted_mean - margin_of_error;
    upper = discounted_mean + margin_of_error;
}

// Function to run multiple benchmark iterations
std::vector<BenchmarkResult> run_benchmark(double S0, double K, double r, double sigma,
                                           double T, bool isCall, int numTrials,
                                           int threads, int iterations)
{
    std::vector<BenchmarkResult> results;
    results.reserve(iterations);

    // Pre-calculate constants
    const double drift = (r - 0.5 * sigma * sigma) * T;
    const double volatility = sigma * sqrt(T);

    // Warm-up run (not included in results)
    double price, lower, upper;
    monte_carlo_black_scholes_mt(S0, K, r, sigma, T, isCall, numTrials, threads, price, lower, upper);

    // Timed benchmark runs
    for (int i = 0; i < iterations; i++)
    {
        // Measure only computation time with high-resolution clock
        auto start_time = std::chrono::high_resolution_clock::now();
        monte_carlo_black_scholes_mt(S0, K, r, sigma, T, isCall, numTrials, threads, price, lower, upper);
        auto end_time = std::chrono::high_resolution_clock::now();

        double execution_time = std::chrono::duration<double, std::milli>(end_time - start_time).count();

        results.push_back({execution_time,
                           price,
                           lower,
                           upper,
                           threads});
    }

    return results;
}

// Function to calculate statistics from benchmark results
void calculate_stats(const std::vector<BenchmarkResult> &results,
                     double &min, double &max, double &avg, double &median)
{
    if (results.empty())
    {
        min = max = avg = median = 0.0;
        return;
    }

    std::vector<double> times;
    times.reserve(results.size());

    for (const auto &result : results)
    {
        times.push_back(result.executionTime);
    }

    min = *std::min_element(times.begin(), times.end());
    max = *std::max_element(times.begin(), times.end());

    // Use std::accumulate for better optimization
    avg = std::accumulate(times.begin(), times.end(), 0.0) / times.size();

    // Calculate median
    std::vector<double> sorted_times = times;
    std::sort(sorted_times.begin(), sorted_times.end());
    if (sorted_times.size() % 2 == 0)
    {
        median = (sorted_times[sorted_times.size() / 2 - 1] + sorted_times[sorted_times.size() / 2]) / 2.0;
    }
    else
    {
        median = sorted_times[sorted_times.size() / 2];
    }
}

int main(int argc, char *argv[])
{
    if (argc < 9)
    {
        std::cerr << "Usage: " << argv[0] << " <S0> <K> <r> <sigma> <T> <isCall> <numTrials> <benchmark_mode> [threads] [iterations]" << std::endl;
        std::cerr << "  benchmark_mode: 0 for single run, 1 for benchmark with multiple iterations" << std::endl;
        return 1;
    }

    try
    {
        // Parse command line arguments
        double S0 = std::stod(argv[1]);
        double K = std::stod(argv[2]);
        double r = std::stod(argv[3]);
        double sigma = std::stod(argv[4]);
        double T = std::stod(argv[5]);
        bool isCall = std::stoi(argv[6]) != 0;
        int numTrials = std::stoi(argv[7]);
        int benchmark_mode = std::stoi(argv[8]);

        // Validate inputs with improved error messages
        if (S0 <= 0.0)
        {
            throw std::invalid_argument("Stock price (S0) must be positive");
        }
        if (K <= 0.0)
        {
            throw std::invalid_argument("Strike price (K) must be positive");
        }
        if (sigma <= 0.0)
        {
            throw std::invalid_argument("Volatility (sigma) must be positive");
        }
        if (T <= 0.0)
        {
            throw std::invalid_argument("Time to maturity (T) must be positive");
        }
        if (numTrials <= 0)
        {
            throw std::invalid_argument("Number of trials must be positive");
        }

        if (benchmark_mode == 0)
        {
            // Single run mode
            int threads = 0;
            if (argc > 9)
            {
                threads = std::stoi(argv[9]);
            }

            double price, lower, upper;
            monte_carlo_black_scholes_mt(S0, K, r, sigma, T, isCall, numTrials, threads, price, lower, upper);

            // Output simplified JSON-formatted result
            std::cout << "{\"optionPrice\":" << std::fixed << std::setprecision(6) << price
                      << ",\"confidence\":{\"lower\":" << lower
                      << ",\"upper\":" << upper
                      << "},\"threadsUsed\":" << threads << "}";
        }
        else
        {
            // Benchmark mode
            int threads = 0;
            int iterations = 5; // Default to 5 iterations

            if (argc > 9)
            {
                threads = std::stoi(argv[9]);
            }

            if (argc > 10)
            {
                iterations = std::stoi(argv[10]);
            }

            // Run benchmark
            auto results = run_benchmark(S0, K, r, sigma, T, isCall, numTrials, threads, iterations);

            // Calculate statistics
            double min_time, max_time, avg_time, median_time;
            calculate_stats(results, min_time, max_time, avg_time, median_time);

            // Output simplified JSON-formatted benchmark results
            std::cout << "{\"statistics\":{\"min\":" << std::fixed << std::setprecision(3) << min_time
                      << ",\"max\":" << max_time
                      << ",\"avg\":" << avg_time
                      << ",\"median\":" << median_time
                      << "},\"iterations\":" << iterations
                      << ",\"threadsUsed\":" << threads
                      << ",\"runs\":[";

            for (size_t i = 0; i < results.size(); i++)
            {
                const auto &result = results[i];
                std::cout << "{\"iteration\":" << (i + 1)
                          << ",\"executionTime\":" << std::fixed << std::setprecision(3) << result.executionTime
                          << ",\"optionPrice\":" << std::fixed << std::setprecision(6) << result.optionPrice
                          << ",\"confidence\":{\"lower\":" << result.lowerBound
                          << ",\"upper\":" << result.upperBound
                          << "}}";

                if (i < results.size() - 1)
                {
                    std::cout << ",";
                }
            }

            std::cout << "]}";
        }
    }
    catch (const std::invalid_argument &e)
    {
        // Return validation errors as JSON for better client integration
        std::cerr << "Error: " << e.what() << std::endl;
        std::cout << "{\"error\":\"" << e.what() << "\"}";
        return 1;
    }
    catch (const std::exception &e)
    {
        std::cerr << "Error: " << e.what() << std::endl;
        std::cout << "{\"error\":\"An unexpected error occurred\"}";
        return 1;
    }
    return 0;
}