#include <iostream>
#include <vector>
#include <cmath>
#include <random>
#include <chrono>
#include <thread>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

// Function to calculate option price using Monte Carlo simulation
json monte_carlo_black_scholes(double S0, double K, double r, double sigma,
                               double T, bool isCall, int numTrials)
{
    // Initialize random number generator
    std::random_device rd;
    std::mt19937 gen(rd());
    std::normal_distribution<> norm_dist(0.0, 1.0);

    // Store all payoffs
    std::vector<double> payoffs(numTrials);

    // Calculate each path
    for (int i = 0; i < numTrials; i++)
    {
        // Generate random normal variable
        double z = norm_dist(gen);

        // Calculate stock price at maturity
        double ST = S0 * exp((r - 0.5 * sigma * sigma) * T + sigma * sqrt(T) * z);

        // Calculate payoff
        double payoff = isCall ? std::max(ST - K, 0.0) : std::max(K - ST, 0.0);
        payoffs[i] = payoff;
    }

    // Calculate the average payoff
    double sum = 0.0;
    for (const auto &payoff : payoffs)
    {
        sum += payoff;
    }
    double mean = sum / numTrials;
    double discounted_mean = mean * exp(-r * T);

    // Calculate variance and standard deviation
    double variance = 0.0;
    for (const auto &payoff : payoffs)
    {
        variance += pow(payoff - mean, 2);
    }
    variance /= (numTrials - 1);
    double std_dev = sqrt(variance);

    // Calculate 95% confidence interval (1.96 is the z-score for 95% confidence)
    double margin_of_error = 1.96 * (std_dev / sqrt(numTrials)) * exp(-r * T);

    // Create JSON result
    json result;
    result["optionPrice"] = discounted_mean;
    result["confidence"]["lower"] = discounted_mean - margin_of_error;
    result["confidence"]["upper"] = discounted_mean + margin_of_error;

    return result;
}

// Multi-threaded version for better performance
json monte_carlo_black_scholes_mt(double S0, double K, double r, double sigma,
                                  double T, bool isCall, int numTrials)
{
    // Determine number of threads to use (hardware concurrency)
    unsigned int num_threads = std::thread::hardware_concurrency();
    if (num_threads == 0)
        num_threads = 4; // Default to 4 if can't determine

    // Calculate trials per thread
    int trials_per_thread = numTrials / num_threads;

    // Vector to store partial results from each thread
    std::vector<std::vector<double>> thread_payoffs(num_threads);
    std::vector<std::thread> threads;

    // Function to be executed by each thread
    auto thread_func = [&](int thread_id, int start_trial, int end_trial)
    {
        // Initialize random number generator for this thread
        std::mt19937 gen(std::random_device{}());
        std::normal_distribution<> norm_dist(0.0, 1.0);

        // Reserve space for payoffs
        thread_payoffs[thread_id].reserve(end_trial - start_trial);

        // Calculate paths for this thread
        for (int i = start_trial; i < end_trial; i++)
        {
            double z = norm_dist(gen);
            double ST = S0 * exp((r - 0.5 * sigma * sigma) * T + sigma * sqrt(T) * z);
            double payoff = isCall ? std::max(ST - K, 0.0) : std::max(K - ST, 0.0);
            thread_payoffs[thread_id].push_back(payoff);
        }
    };

    // Launch threads
    for (unsigned int i = 0; i < num_threads; i++)
    {
        int start_trial = i * trials_per_thread;
        int end_trial = (i == num_threads - 1) ? numTrials : (i + 1) * trials_per_thread;
        threads.emplace_back(thread_func, i, start_trial, end_trial);
    }

    // Wait for all threads to complete
    for (auto &thread : threads)
    {
        thread.join();
    }

    // Combine results from all threads
    std::vector<double> all_payoffs;
    for (const auto &thread_result : thread_payoffs)
    {
        all_payoffs.insert(all_payoffs.end(), thread_result.begin(), thread_result.end());
    }

    // Calculate mean
    double sum = 0.0;
    for (const auto &payoff : all_payoffs)
    {
        sum += payoff;
    }
    double mean = sum / all_payoffs.size();
    double discounted_mean = mean * exp(-r * T);

    // Calculate variance and standard deviation
    double variance = 0.0;
    for (const auto &payoff : all_payoffs)
    {
        variance += pow(payoff - mean, 2);
    }
    variance /= (all_payoffs.size() - 1);
    double std_dev = sqrt(variance);

    // Calculate 95% confidence interval
    double margin_of_error = 1.96 * (std_dev / sqrt(all_payoffs.size())) * exp(-r * T);

    // Create JSON result
    json result;
    result["optionPrice"] = discounted_mean;
    result["confidence"]["lower"] = discounted_mean - margin_of_error;
    result["confidence"]["upper"] = discounted_mean + margin_of_error;

    return result;
}

int main(int argc, char *argv[])
{
    if (argc != 2)
    {
        std::cerr << "Usage: " << argv[0] << " <json_input>" << std::endl;
        return 1;
    }

    try
    {
        // Parse JSON input
        json input = json::parse(argv[1]);

        // Extract parameters
        double S0 = input["S0"].get<double>();
        double K = input["K"].get<double>();
        double r = input["r"].get<double>();
        double sigma = input["sigma"].get<double>();
        double T = input["T"].get<double>();
        bool isCall = input["isCall"].get<bool>();
        int numTrials = input["numTrials"].get<int>();

        // Validate inputs
        if (S0 <= 0 || K <= 0 || sigma <= 0 || T <= 0 || numTrials <= 0)
        {
            throw std::invalid_argument("Invalid input parameters");
        }

        // Use multi-threaded version for better performance
        json result = monte_carlo_black_scholes_mt(S0, K, r, sigma, T, isCall, numTrials);

        // Output JSON result
        std::cout << result.dump() << std::endl;
    }
    catch (const std::exception &e)
    {
        // Return error as JSON
        json error;
        error["error"] = e.what();
        std::cout << error.dump() << std::endl;
        return 1;
    }

    return 0;
}