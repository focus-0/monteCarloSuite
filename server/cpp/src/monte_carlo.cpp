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

// Multi-threaded Asian Option Pricing (arithmetic average daily steps)
void monte_carlo_asian_option_mt(double S0, double K, double r, double sigma,
                                  double T, bool isCall, int numTrials, int numSteps, int num_threads,
                                  double &price, double &lower, double &upper)
{
    if (numSteps <= 0) numSteps = 252; // Default to daily steps for 1 year
    if (num_threads <= 0) {
        num_threads = std::thread::hardware_concurrency();
        if (num_threads == 0) num_threads = 4;
    }
    num_threads = std::min(num_threads, numTrials);

    int trials_per_thread = numTrials / num_threads;
    int remaining_trials = numTrials % num_threads;

    const double dt = T / numSteps;
    const double drift = (r - 0.5 * sigma * sigma) * dt;
    const double vol_sqrt_dt = sigma * sqrt(dt);
    const double discount = exp(-r * T);

    struct ThreadResult {
        double sum;
        double sum_squared;
        int count;
    };

    std::vector<ThreadResult> thread_results(num_threads, {0.0, 0.0, 0});
    std::vector<std::thread> threads;
    threads.reserve(num_threads);

    auto thread_func = [&](int thread_id, int count) {
        double local_sum = 0.0;
        double local_sum_squared = 0.0;

        std::mt19937_64 gen(std::chrono::high_resolution_clock::now().time_since_epoch().count() + thread_id * 1000);
        std::normal_distribution<> norm_dist(0.0, 1.0);

        for (int i = 0; i < count; ++i) {
            double current_S = S0;
            double path_sum = current_S;

            for (int step = 0; step < numSteps; ++step) {
                const double z = norm_dist(gen);
                current_S *= exp(drift + vol_sqrt_dt * z);
                path_sum += current_S;
            }

            double arithmetic_avg = path_sum / (numSteps + 1);
            double payoff = calculate_payoff(arithmetic_avg, K, isCall);

            local_sum += payoff;
            local_sum_squared += payoff * payoff;
        }

        thread_results[thread_id] = {local_sum, local_sum_squared, count};
    };

    int start_idx = 0;
    for (int i = 0; i < num_threads; ++i) {
        int count = trials_per_thread + (i < remaining_trials ? 1 : 0);
        threads.emplace_back(thread_func, i, count);
        start_idx += count;
    }

    for (auto &t : threads) {
        t.join();
    }

    double total_sum = 0.0;
    double total_sum_squared = 0.0;
    int total_count = 0;

    for (const auto &res : thread_results) {
        total_sum += res.sum;
        total_sum_squared += res.sum_squared;
        total_count += res.count;
    }

    double mean = total_sum / total_count;
    double discounted_mean = mean * discount;
    double variance = (total_sum_squared / total_count) - (mean * mean);
    if (variance < 0.0) variance = 0.0;
    double std_dev = sqrt(variance);
    double margin_of_error = 1.96 * (std_dev / sqrt(total_count)) * discount;

    price = discounted_mean;
    lower = discounted_mean - margin_of_error;
    upper = discounted_mean + margin_of_error;
}

// Calculate Finite-Difference Greeks (Delta, Gamma, Vega, Theta, Rho)
struct GreeksResult {
    double delta;
    double gamma;
    double vega;
    double theta;
    double rho;
    double basePrice;
};

GreeksResult calculate_greeks_mt(double S0, double K, double r, double sigma,
                                double T, bool isCall, int numTrials, int num_threads)
{
    if (num_threads <= 0) {
        num_threads = std::thread::hardware_concurrency();
        if (num_threads == 0) num_threads = 4;
    }
    num_threads = std::min(num_threads, numTrials);

    int trials_per_thread = numTrials / num_threads;
    int remaining_trials = numTrials % num_threads;

    const double h_S = 0.005 * S0;       // 0.5% spot bump
    const double h_vol = 0.005;          // 50 bps vol bump
    const double h_T = 1.0 / 365.0;      // 1 day time decay bump
    const double h_r = 0.0005;           // 5 bps interest rate bump

    const double T_down = std::max(0.0001, T - h_T);
    const double sigma_down = std::max(0.001, sigma - h_vol);
    const double r_down = std::max(0.0, r - h_r);

    const double drift_base = (r - 0.5 * sigma * sigma) * T;
    const double vol_sqrt_T = sigma * std::sqrt(T);
    const double discount_base = std::exp(-r * T);

    const double drift_S_up = drift_base;
    const double drift_S_down = drift_base;

    const double drift_vol_up = (r - 0.5 * (sigma + h_vol) * (sigma + h_vol)) * T;
    const double vol_sqrt_T_vol_up = (sigma + h_vol) * std::sqrt(T);

    const double drift_vol_down = (r - 0.5 * sigma_down * sigma_down) * T;
    const double vol_sqrt_T_vol_down = sigma_down * std::sqrt(T);

    const double drift_T_down = (r - 0.5 * sigma * sigma) * T_down;
    const double vol_sqrt_T_down = sigma * std::sqrt(T_down);
    const double discount_T_down = std::exp(-r * T_down);

    const double drift_r_up = ((r + h_r) - 0.5 * sigma * sigma) * T;
    const double discount_r_up = std::exp(-(r + h_r) * T);

    const double drift_r_down = (r_down - 0.5 * sigma * sigma) * T;
    const double discount_r_down = std::exp(-r_down * T);

    struct ThreadSums {
        double base;
        double S_up;
        double S_down;
        double vol_up;
        double vol_down;
        double T_down;
        double r_up;
        double r_down;
    };

    std::vector<ThreadSums> thread_sums(num_threads, {0,0,0,0,0,0,0,0});
    std::vector<std::thread> threads;
    threads.reserve(num_threads);

    for (int t = 0; t < num_threads; ++t) {
        int count = trials_per_thread + (t < remaining_trials ? 1 : 0);

        threads.emplace_back([&, t, count]() {
            std::mt19937_64 gen(std::chrono::high_resolution_clock::now().time_since_epoch().count() + t * 7777);
            std::normal_distribution<> norm_dist(0.0, 1.0);

            double sum_base = 0.0;
            double sum_S_up = 0.0;
            double sum_S_down = 0.0;
            double sum_vol_up = 0.0;
            double sum_vol_down = 0.0;
            double sum_T_down = 0.0;
            double sum_r_up = 0.0;
            double sum_r_down = 0.0;

            for (int i = 0; i < count; ++i) {
                const double z = norm_dist(gen);

                const double ST_base = S0 * std::exp(drift_base + vol_sqrt_T * z);
                sum_base += calculate_payoff(ST_base, K, isCall);

                const double ST_S_up = (S0 + h_S) * std::exp(drift_S_up + vol_sqrt_T * z);
                sum_S_up += calculate_payoff(ST_S_up, K, isCall);

                const double ST_S_down = (S0 - h_S) * std::exp(drift_S_down + vol_sqrt_T * z);
                sum_S_down += calculate_payoff(ST_S_down, K, isCall);

                const double ST_vol_up = S0 * std::exp(drift_vol_up + vol_sqrt_T_vol_up * z);
                sum_vol_up += calculate_payoff(ST_vol_up, K, isCall);

                const double ST_vol_down = S0 * std::exp(drift_vol_down + vol_sqrt_T_vol_down * z);
                sum_vol_down += calculate_payoff(ST_vol_down, K, isCall);

                const double ST_T_down = S0 * std::exp(drift_T_down + vol_sqrt_T_down * z);
                sum_T_down += calculate_payoff(ST_T_down, K, isCall);

                const double ST_r_up = S0 * std::exp(drift_r_up + vol_sqrt_T * z);
                sum_r_up += calculate_payoff(ST_r_up, K, isCall);

                const double ST_r_down = S0 * std::exp(drift_r_down + vol_sqrt_T * z);
                sum_r_down += calculate_payoff(ST_r_down, K, isCall);
            }

            thread_sums[t] = {sum_base, sum_S_up, sum_S_down, sum_vol_up, sum_vol_down, sum_T_down, sum_r_up, sum_r_down};
        });
    }

    for (auto &th : threads) {
        th.join();
    }

    double tot_base = 0, tot_S_up = 0, tot_S_down = 0, tot_vol_up = 0, tot_vol_down = 0, tot_T_down = 0, tot_r_up = 0, tot_r_down = 0;
    for (const auto &ts : thread_sums) {
        tot_base += ts.base;
        tot_S_up += ts.S_up;
        tot_S_down += ts.S_down;
        tot_vol_up += ts.vol_up;
        tot_vol_down += ts.vol_down;
        tot_T_down += ts.T_down;
        tot_r_up += ts.r_up;
        tot_r_down += ts.r_down;
    }

    double price_base = (tot_base / numTrials) * discount_base;
    double price_S_up = (tot_S_up / numTrials) * discount_base;
    double price_S_down = (tot_S_down / numTrials) * discount_base;
    double price_vol_up = (tot_vol_up / numTrials) * discount_base;
    double price_vol_down = (tot_vol_down / numTrials) * discount_base;
    double price_T_down = (tot_T_down / numTrials) * discount_T_down;
    double price_r_up = (tot_r_up / numTrials) * discount_r_up;
    double price_r_down = (tot_r_down / numTrials) * discount_r_down;

    double delta = (price_S_up - price_S_down) / (2.0 * h_S);
    double gamma = (price_S_up - 2.0 * price_base + price_S_down) / (h_S * h_S);
    double vega = (price_vol_up - price_vol_down) / (2.0 * h_vol);
    double theta = (price_T_down - price_base) / h_T;
    double rho = (price_r_up - price_r_down) / (2.0 * h_r);

    return {delta, gamma, vega, theta, rho, price_base};
}

// Generate Sample Price Paths for Visualizer
std::vector<std::vector<double>> generate_price_paths(double S0, double r, double sigma, double T, int numPaths = 50, int numSteps = 100)
{
    std::vector<std::vector<double>> paths(numPaths, std::vector<double>(numSteps + 1, S0));
    double dt = T / numSteps;
    double drift = (r - 0.5 * sigma * sigma) * dt;
    double vol_sqrt_dt = sigma * sqrt(dt);

    std::mt19937_64 gen(12345); // Fixed seed for reproducible paths
    std::normal_distribution<> norm_dist(0.0, 1.0);

    for (int p = 0; p < numPaths; ++p) {
        double S = S0;
        paths[p][0] = S0;
        for (int step = 1; step <= numSteps; ++step) {
            double z = norm_dist(gen);
            S *= exp(drift + vol_sqrt_dt * z);
            paths[p][step] = S;
        }
    }

    return paths;
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

// Normal cumulative distribution function (CDF)
FORCE_INLINE double norm_cdf(double x)
{
    return 0.5 * std::erfc(-x * M_SQRT1_2);
}

// Analytical Black-Scholes Delta for Call and Put
FORCE_INLINE double bs_delta(double S, double K, double r, double sigma, double tau, bool isCall)
{
    if (tau <= 1e-6 || S <= 1e-6)
    {
        if (isCall) return (S > K) ? 1.0 : 0.0;
        else return (S < K) ? -1.0 : 0.0;
    }
    double d1 = (std::log(S / K) + (r + 0.5 * sigma * sigma) * tau) / (sigma * std::sqrt(tau));
    double N_d1 = norm_cdf(d1);
    return isCall ? N_d1 : (N_d1 - 1.0);
}

// Analytical Black-Scholes Price for Call and Put
FORCE_INLINE double bs_price(double S, double K, double r, double sigma, double tau, bool isCall)
{
    if (tau <= 1e-6 || S <= 1e-6)
    {
        return calculate_payoff(S, K, isCall);
    }
    double d1 = (std::log(S / K) + (r + 0.5 * sigma * sigma) * tau) / (sigma * std::sqrt(tau));
    double d2 = d1 - sigma * std::sqrt(tau);
    if (isCall) {
        return S * norm_cdf(d1) - K * std::exp(-r * tau) * norm_cdf(d2);
    } else {
        return K * std::exp(-r * tau) * norm_cdf(-d2) - S * norm_cdf(-d1);
    }
}

// Structure to store Hedging Simulation Summary
struct DeltaHedgeResult
{
    double meanPnL;
    double stdDevPnL;
    double minPnL;
    double maxPnL;
    double var95;
    double cvar95;
    double avgTxCosts;
    double executionTimeMs;
    int numPaths;
    int numSteps;
    int rebalanceFreq;
    double txCostPct;
    std::vector<double> pnlDistribution;
    std::vector<std::vector<std::vector<double>>> samplePaths;
};

DeltaHedgeResult simulate_delta_hedging_mt(double S0, double K, double r, double sigma,
                                           double T, bool isCall, int numPaths,
                                           int numSteps, int rebalanceFreq, double txCostPct,
                                           int num_threads)
{
    auto start_time = std::chrono::high_resolution_clock::now();

    if (num_threads <= 0) {
        num_threads = std::thread::hardware_concurrency();
        if (num_threads == 0) num_threads = 4;
    }
    num_threads = std::min(num_threads, numPaths);

    int paths_per_thread = numPaths / num_threads;
    int remaining_paths = numPaths % num_threads;

    const double dt = T / numSteps;
    const double drift = (r - 0.5 * sigma * sigma) * dt;
    const double vol_sqrt_dt = sigma * std::sqrt(dt);

    const double V0 = bs_price(S0, K, r, sigma, T, isCall);
    const double delta0 = bs_delta(S0, K, r, sigma, T, isCall);
    const double cost0 = std::abs(delta0) * S0 * txCostPct;
    const double C0 = V0 - delta0 * S0 - cost0;

    std::vector<std::vector<double>> thread_pnls(num_threads);
    std::vector<double> thread_tx_costs(num_threads, 0.0);
    std::vector<std::thread> threads;
    threads.reserve(num_threads);

    for (int t = 0; t < num_threads; ++t) {
        int t_paths = paths_per_thread + (t < remaining_paths ? 1 : 0);
        thread_pnls[t].reserve(t_paths);

        threads.emplace_back([&, t, t_paths]() {
            std::mt19937_64 gen(std::chrono::high_resolution_clock::now().time_since_epoch().count() + t * 9999);
            std::normal_distribution<> norm_dist(0.0, 1.0);

            double total_tx_accum = 0.0;

            for (int p = 0; p < t_paths; ++p) {
                double S = S0;
                double shares = delta0;
                double cash = C0;
                double path_tx_cost = cost0;

                for (int step = 1; step <= numSteps; ++step) {
                    double z = norm_dist(gen);
                    S *= std::exp(drift + vol_sqrt_dt * z);
                    cash *= std::exp(r * dt);

                    double tau = T - step * dt;
                    if (step % rebalanceFreq == 0 && step < numSteps) {
                        double target_delta = bs_delta(S, K, r, sigma, std::max(tau, 1e-6), isCall);
                        double d_shares = target_delta - shares;
                        double trade_cost = std::abs(d_shares) * S * txCostPct;
                        cash -= (d_shares * S + trade_cost);
                        shares = target_delta;
                        path_tx_cost += trade_cost;
                    }
                }

                double payoff = calculate_payoff(S, K, isCall);
                double liquidating_cost = std::abs(shares) * S * txCostPct;
                double final_cash = cash + shares * S - liquidating_cost - payoff;

                thread_pnls[t].push_back(final_cash);
                total_tx_accum += path_tx_cost;
            }

            thread_tx_costs[t] = total_tx_accum;
        });
    }

    for (auto& th : threads) {
        th.join();
    }

    std::vector<double> all_pnls;
    all_pnls.reserve(numPaths);
    double total_tx_all = 0.0;

    for (int t = 0; t < num_threads; ++t) {
        all_pnls.insert(all_pnls.end(), thread_pnls[t].begin(), thread_pnls[t].end());
        total_tx_all += thread_tx_costs[t];
    }

    std::sort(all_pnls.begin(), all_pnls.end());

    double sum_pnl = std::accumulate(all_pnls.begin(), all_pnls.end(), 0.0);
    double mean_pnl = sum_pnl / numPaths;

    double var_sum = 0.0;
    for (double pnl : all_pnls) {
        double diff = pnl - mean_pnl;
        var_sum += diff * diff;
    }
    double std_dev_pnl = std::sqrt(var_sum / (numPaths > 1 ? numPaths - 1 : 1));

    double min_pnl = all_pnls.front();
    double max_pnl = all_pnls.back();

    int var_idx = static_cast<int>(0.05 * numPaths);
    double var95 = all_pnls[var_idx];
    double cvar95_sum = std::accumulate(all_pnls.begin(), all_pnls.begin() + var_idx + 1, 0.0);
    double cvar95 = cvar95_sum / (var_idx + 1);

    double avg_tx_cost = total_tx_all / numPaths;

    std::vector<std::vector<std::vector<double>>> sample_paths;
    int sample_count = std::min(5, numPaths);
    std::mt19937_64 sample_gen(42);
    std::normal_distribution<> norm_dist(0.0, 1.0);

    for (int p = 0; p < sample_count; ++p) {
        std::vector<std::vector<double>> path_steps;
        path_steps.reserve(numSteps + 1);

        double S = S0;
        double delta = delta0;
        double shares = delta0;
        double cash = C0;

        path_steps.push_back({0.0, S, delta, shares, cash, cash + shares * S - V0});

        for (int step = 1; step <= numSteps; ++step) {
            double z = norm_dist(sample_gen);
            S *= std::exp(drift + vol_sqrt_dt * z);
            cash *= std::exp(r * dt);

            double tau = T - step * dt;
            if (step % rebalanceFreq == 0 && step < numSteps) {
                double target_delta = bs_delta(S, K, r, sigma, std::max(tau, 1e-6), isCall);
                double d_shares = target_delta - shares;
                double trade_cost = std::abs(d_shares) * S * txCostPct;
                cash -= (d_shares * S + trade_cost);
                shares = target_delta;
                delta = target_delta;
            }

            double opt_val = (step == numSteps) ? calculate_payoff(S, K, isCall) : bs_price(S, K, r, sigma, std::max(tau, 1e-6), isCall);
            double hedge_error = cash + shares * S - opt_val;
            path_steps.push_back({step * dt, S, delta, shares, cash, hedge_error});
        }

        sample_paths.push_back(path_steps);
    }

    auto end_time = std::chrono::high_resolution_clock::now();
    double exec_ms = std::chrono::duration<double, std::milli>(end_time - start_time).count();

    return {mean_pnl, std_dev_pnl, min_pnl, max_pnl, var95, cvar95, avg_tx_cost, exec_ms, numPaths, numSteps, rebalanceFreq, txCostPct, all_pnls, sample_paths};
}

int main(int argc, char *argv[])
{
    if (argc < 9)
    {
        std::cerr << "Usage: " << argv[0] << " <S0> <K> <r> <sigma> <T> <isCall> <numTrials> <benchmark_mode> [threads] [numSteps/iterations] [rebalanceFreq] [txCostPct]" << std::endl;
        std::cerr << "  benchmark_mode: 0 = European single run, 1 = benchmark, 2 = Asian option, 3 = Greeks, 4 = Price paths, 5 = Delta-Hedging Simulator" << std::endl;
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
        if (S0 <= 0.0) throw std::invalid_argument("Stock price (S0) must be positive");
        if (K <= 0.0) throw std::invalid_argument("Strike price (K) must be positive");
        if (sigma <= 0.0) throw std::invalid_argument("Volatility (sigma) must be positive");
        if (T <= 0.0) throw std::invalid_argument("Time to maturity (T) must be positive");
        if (numTrials <= 0) throw std::invalid_argument("Number of trials must be positive");

        int threads = 0;
        if (argc > 9) {
            threads = std::stoi(argv[9]);
        }

        if (benchmark_mode == 0)
        {
            // European Single Run Mode
            auto start_t = std::chrono::high_resolution_clock::now();
            double price, lower, upper;
            monte_carlo_black_scholes_mt(S0, K, r, sigma, T, isCall, numTrials, threads, price, lower, upper);
            auto end_t = std::chrono::high_resolution_clock::now();
            double exec_ms = std::chrono::duration<double, std::milli>(end_t - start_t).count();

            std::cout << "{\"optionType\":\"european\",\"executionTimeMs\":" << std::fixed << std::setprecision(3) << exec_ms
                      << ",\"optionPrice\":" << std::fixed << std::setprecision(6) << price
                      << ",\"confidence\":{\"lower\":" << lower
                      << ",\"upper\":" << upper
                      << "},\"threadsUsed\":" << threads << "}";
        }
        else if (benchmark_mode == 2)
        {
            // Asian Option Mode
            int numSteps = 252;
            if (argc > 10) {
                numSteps = std::stoi(argv[10]);
            }

            auto start_t = std::chrono::high_resolution_clock::now();
            double price, lower, upper;
            monte_carlo_asian_option_mt(S0, K, r, sigma, T, isCall, numTrials, numSteps, threads, price, lower, upper);
            auto end_t = std::chrono::high_resolution_clock::now();
            double exec_ms = std::chrono::duration<double, std::milli>(end_t - start_t).count();

            std::cout << "{\"optionType\":\"asian\",\"executionTimeMs\":" << std::fixed << std::setprecision(3) << exec_ms
                      << ",\"numSteps\":" << numSteps
                      << ",\"optionPrice\":" << std::fixed << std::setprecision(6) << price
                      << ",\"confidence\":{\"lower\":" << lower
                      << ",\"upper\":" << upper
                      << "},\"threadsUsed\":" << threads << "}";
        }
        else if (benchmark_mode == 3)
        {
            // Greeks Calculation Mode
            auto start_t = std::chrono::high_resolution_clock::now();
            GreeksResult greeks = calculate_greeks_mt(S0, K, r, sigma, T, isCall, numTrials, threads);
            auto end_t = std::chrono::high_resolution_clock::now();
            double exec_ms = std::chrono::duration<double, std::milli>(end_t - start_t).count();

            std::cout << "{\"executionTimeMs\":" << std::fixed << std::setprecision(3) << exec_ms
                      << ",\"optionPrice\":" << std::fixed << std::setprecision(6) << greeks.basePrice
                      << ",\"greeks\":{\"delta\":" << greeks.delta
                      << ",\"gamma\":" << greeks.gamma
                      << ",\"vega\":" << greeks.vega
                      << ",\"theta\":" << greeks.theta
                      << ",\"rho\":" << greeks.rho
                      << "},\"threadsUsed\":" << threads << "}";
        }
        else if (benchmark_mode == 4)
        {
            // Price Paths Generation Mode
            int numPaths = 50;
            int numSteps = 100;
            if (argc > 9) numPaths = std::stoi(argv[9]);
            if (argc > 10) numSteps = std::stoi(argv[10]);

            auto start_t = std::chrono::high_resolution_clock::now();
            auto paths = generate_price_paths(S0, r, sigma, T, numPaths, numSteps);
            auto end_t = std::chrono::high_resolution_clock::now();
            double exec_ms = std::chrono::duration<double, std::milli>(end_t - start_t).count();

            std::cout << "{\"executionTimeMs\":" << std::fixed << std::setprecision(3) << exec_ms
                      << ",\"numPaths\":" << numPaths << ",\"numSteps\":" << numSteps << ",\"paths\":[";
            for (size_t i = 0; i < paths.size(); ++i) {
                std::cout << "[";
                for (size_t j = 0; j < paths[i].size(); ++j) {
                    std::cout << std::fixed << std::setprecision(4) << paths[i][j];
                    if (j < paths[i].size() - 1) std::cout << ",";
                }
                std::cout << "]";
                if (i < paths.size() - 1) std::cout << ",";
            }
            std::cout << "]}";
        }
        else if (benchmark_mode == 5)
        {
            // Delta-Hedging Simulator Mode
            int numSteps = 252;
            int rebalanceFreq = 1;
            double txCostPct = 0.001; // 10 bps

            if (argc > 10) numSteps = std::stoi(argv[10]);
            if (argc > 11) rebalanceFreq = std::stoi(argv[11]);
            if (argc > 12) txCostPct = std::stod(argv[12]);

            DeltaHedgeResult res = simulate_delta_hedging_mt(S0, K, r, sigma, T, isCall, numTrials, numSteps, rebalanceFreq, txCostPct, threads);

            std::cout << "{\"executionTimeMs\":" << std::fixed << std::setprecision(3) << res.executionTimeMs
                      << ",\"numPaths\":" << res.numPaths
                      << ",\"numSteps\":" << res.numSteps
                      << ",\"rebalanceFreq\":" << res.rebalanceFreq
                      << ",\"transactionCostPct\":" << std::fixed << std::setprecision(5) << res.txCostPct
                      << ",\"summaryStatistics\":{"
                      << "\"meanPnL\":" << std::fixed << std::setprecision(4) << res.meanPnL
                      << ",\"stdDevPnL\":" << res.stdDevPnL
                      << ",\"minPnL\":" << res.minPnL
                      << ",\"maxPnL\":" << res.maxPnL
                      << ",\"var95\":" << res.var95
                      << ",\"cvar95\":" << res.cvar95
                      << ",\"avgTxCosts\":" << res.avgTxCosts
                      << "},\"pnlDistribution\":[";

            for (size_t i = 0; i < res.pnlDistribution.size(); ++i) {
                std::cout << std::fixed << std::setprecision(4) << res.pnlDistribution[i];
                if (i < res.pnlDistribution.size() - 1) std::cout << ",";
            }
            std::cout << "],\"samplePaths\":[";
            for (size_t i = 0; i < res.samplePaths.size(); ++i) {
                std::cout << "[";
                for (size_t j = 0; j < res.samplePaths[i].size(); ++j) {
                    std::cout << "{\"t\":" << std::fixed << std::setprecision(4) << res.samplePaths[i][j][0]
                              << ",\"stock\":" << res.samplePaths[i][j][1]
                              << ",\"delta\":" << res.samplePaths[i][j][2]
                              << ",\"shares\":" << res.samplePaths[i][j][3]
                              << ",\"cash\":" << res.samplePaths[i][j][4]
                              << ",\"hedgeError\":" << res.samplePaths[i][j][5]
                              << "}";
                    if (j < res.samplePaths[i].size() - 1) std::cout << ",";
                }
                std::cout << "]";
                if (i < res.samplePaths.size() - 1) std::cout << ",";
            }
            std::cout << "]}";
        }
        else
        {
            // Benchmark mode (mode = 1)
            int iterations = 5;
            if (argc > 10) {
                iterations = std::stoi(argv[10]);
            }

            auto results = run_benchmark(S0, K, r, sigma, T, isCall, numTrials, threads, iterations);

            double min_time, max_time, avg_time, median_time;
            calculate_stats(results, min_time, max_time, avg_time, median_time);

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