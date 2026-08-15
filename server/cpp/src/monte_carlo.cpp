#include <iostream>
#include <vector>
#include <cmath>
#include <chrono>
#include <thread>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <array>
#include <numeric>
#include <random>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#ifndef M_SQRT1_2
#define M_SQRT1_2 0.70710678118654752440
#endif

// Fast inline macros
#if defined(__GNUC__) || defined(__clang__)
#define FORCE_INLINE __attribute__((always_inline)) inline
#else
#define FORCE_INLINE __forceinline
#endif

// Fast 64-bit Xoshiro256+ PRNG (State-of-the-art fast uniform generator)
struct Xoshiro256Plus {
    uint64_t s[4];

    static FORCE_INLINE uint64_t rotl(const uint64_t x, int k) {
        return (x << k) | (x >> (64 - k));
    }

    FORCE_INLINE uint64_t next() {
        const uint64_t result = s[0] + s[3];
        const uint64_t t = s[1] << 17;
        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = rotl(s[3], 45);
        return result;
    }

    // Uniform [0, 1) double with 53-bit resolution
    FORCE_INLINE double next_double() {
        return (next() >> 11) * 0x1.0p-53;
    }

    // Fast Box-Muller generating 2 independent standard normal variates
    FORCE_INLINE void next_normal_pair(double &z1, double &z2) {
        double u1 = next_double();
        while (u1 <= 1e-15) u1 = next_double();
        double u2 = next_double();
        double radius = std::sqrt(-2.0 * std::log(u1));
        double theta = 2.0 * M_PI * u2;
        z1 = radius * std::cos(theta);
        z2 = radius * std::sin(theta);
    }

    // Single normal draw
    FORCE_INLINE double next_normal() {
        double z1, z2;
        next_normal_pair(z1, z2);
        return z1;
    }
};

// Seed generator using true hardware entropy combined with high-res timestamp
static Xoshiro256Plus create_seeded_rng(uint64_t thread_id = 0) {
    Xoshiro256Plus rng;
    std::random_device rd;
    uint64_t seed1 = (static_cast<uint64_t>(rd()) << 32) | rd();
    uint64_t seed2 = std::chrono::high_resolution_clock::now().time_since_epoch().count();
    uint64_t seed3 = thread_id * 0x9e3779b97f4a7c15ULL;
    
    // Splitmix64 initialization of 256-bit state
    auto splitmix64 = [](uint64_t &x) -> uint64_t {
        uint64_t z = (x += 0x9e3779b97f4a7c15ULL);
        z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
        z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
        return z ^ (z >> 31);
    };

    uint64_t sm_state = seed1 ^ seed2 ^ seed3;
    if (sm_state == 0) sm_state = 0x853c49e6748fea9bULL;
    rng.s[0] = splitmix64(sm_state);
    rng.s[1] = splitmix64(sm_state);
    rng.s[2] = splitmix64(sm_state);
    rng.s[3] = splitmix64(sm_state);
    if ((rng.s[0] | rng.s[1] | rng.s[2] | rng.s[3]) == 0) {
        rng.s[0] = 1;
    }
    return rng;
}

// Branchless payoff calculation
FORCE_INLINE double calculate_payoff(double ST, double K, bool isCall) {
    const double call_payoff = ST - K;
    const double put_payoff = K - ST;
    const double call_result = call_payoff > 0.0 ? call_payoff : 0.0;
    const double put_result = put_payoff > 0.0 ? put_payoff : 0.0;
    return isCall ? call_result : put_result;
}

// Analytical Normal CDF using erfc
FORCE_INLINE double norm_cdf(double x) {
    return 0.5 * std::erfc(-x * M_SQRT1_2);
}

// Analytical Black-Scholes Delta for Call and Put
FORCE_INLINE double bs_delta(double S, double K, double r, double sigma, double tau, bool isCall) {
    if (tau <= 1e-6 || S <= 1e-6) {
        if (isCall) return (S > K) ? 1.0 : 0.0;
        else return (S < K) ? -1.0 : 0.0;
    }
    double d1 = (std::log(S / K) + (r + 0.5 * sigma * sigma) * tau) / (sigma * std::sqrt(tau));
    double N_d1 = norm_cdf(d1);
    return isCall ? N_d1 : (N_d1 - 1.0);
}

// Analytical Black-Scholes Price for Call and Put
FORCE_INLINE double bs_price(double S, double K, double r, double sigma, double tau, bool isCall) {
    if (tau <= 1e-6 || S <= 1e-6) {
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

// Single-threaded European option pricing using Antithetic Variates and CPU registers (zero heap allocation)
void monte_carlo_black_scholes(double S0, double K, double r, double sigma,
                               double T, bool isCall, int numTrials,
                               double &price, double &lower, double &upper) {
    if (S0 <= 0.0) throw std::invalid_argument("Stock price (S0) must be positive");
    if (K <= 0.0) throw std::invalid_argument("Strike price (K) must be positive");
    if (sigma <= 0.0) throw std::invalid_argument("Volatility (sigma) must be positive");
    if (T <= 0.0) throw std::invalid_argument("Time to maturity (T) must be positive");
    if (numTrials <= 0) throw std::invalid_argument("Number of trials must be positive");

    Xoshiro256Plus rng = create_seeded_rng(0);

    const double drift = (r - 0.5 * sigma * sigma) * T;
    const double vol_sqrt_T = sigma * std::sqrt(T);
    const double discount = std::exp(-r * T);

    double sum = 0.0;
    double sum_squared = 0.0;

    // Process with Antithetic Variates in paired steps (+z and -z)
    int pairs = numTrials / 2;
    for (int i = 0; i < pairs; ++i) {
        double z1, z2;
        rng.next_normal_pair(z1, z2);

        // Path 1 (+z1) & Antithetic Path 1 (-z1)
        double ST1_pos = S0 * std::exp(drift + vol_sqrt_T * z1);
        double ST1_neg = S0 * std::exp(drift - vol_sqrt_T * z1);
        double p1_pos = calculate_payoff(ST1_pos, K, isCall);
        double p1_neg = calculate_payoff(ST1_neg, K, isCall);
        double pair1_avg = 0.5 * (p1_pos + p1_neg);

        // Accumulate statistics
        sum += p1_pos + p1_neg;
        sum_squared += pair1_avg * pair1_avg;
    }

    if (numTrials % 2 != 0) {
        double z = rng.next_normal();
        double ST = S0 * std::exp(drift + vol_sqrt_T * z);
        double p = calculate_payoff(ST, K, isCall);
        sum += p;
        sum_squared += p * p;
    }

    double mean = sum / numTrials;
    double discounted_mean = mean * discount;

    // Variance using antithetic pair sample variance
    double pair_mean = mean;
    double pair_var = (sum_squared / pairs) - (pair_mean * pair_mean);
    if (pair_var < 0.0) pair_var = 0.0;
    double std_dev = std::sqrt(pair_var);
    double margin_of_error = 1.96 * (std_dev / std::sqrt(static_cast<double>(pairs))) * discount;

    price = discounted_mean;
    lower = discounted_mean - margin_of_error;
    upper = discounted_mean + margin_of_error;
}

// Multi-threaded European option pricing with Antithetic Variates & register accumulators
void monte_carlo_black_scholes_mt(double S0, double K, double r, double sigma,
                                  double T, bool isCall, int numTrials, int num_threads,
                                  double &price, double &lower, double &upper) {
    if (S0 <= 0.0) throw std::invalid_argument("Stock price (S0) must be positive");
    if (K <= 0.0) throw std::invalid_argument("Strike price (K) must be positive");
    if (sigma <= 0.0) throw std::invalid_argument("Volatility (sigma) must be positive");
    if (T <= 0.0) throw std::invalid_argument("Time to maturity (T) must be positive");
    if (numTrials <= 0) throw std::invalid_argument("Number of trials must be positive");

    if (num_threads <= 0) {
        num_threads = std::thread::hardware_concurrency();
        if (num_threads == 0) num_threads = 4;
    }
    num_threads = std::min(num_threads, std::max(1, numTrials / 2));

    int total_pairs = numTrials / 2;
    int pairs_per_thread = total_pairs / num_threads;
    int remaining_pairs = total_pairs % num_threads;

    const double drift = (r - 0.5 * sigma * sigma) * T;
    const double vol_sqrt_T = sigma * std::sqrt(T);
    const double discount = std::exp(-r * T);

    struct ThreadResult {
        double sum;
        double sum_squared;
        int pairs_count;
    };

    std::vector<ThreadResult> thread_results(num_threads, {0.0, 0.0, 0});
    std::vector<std::thread> threads;
    threads.reserve(num_threads);

    for (int t = 0; t < num_threads; ++t) {
        int t_pairs = pairs_per_thread + (t < remaining_pairs ? 1 : 0);

        threads.emplace_back([&, t, t_pairs]() {
            Xoshiro256Plus rng = create_seeded_rng(t + 1);
            double local_sum = 0.0;
            double local_sum_squared = 0.0;

            for (int i = 0; i < t_pairs; ++i) {
                double z1, z2;
                rng.next_normal_pair(z1, z2);

                double ST_pos = S0 * std::exp(drift + vol_sqrt_T * z1);
                double ST_neg = S0 * std::exp(drift - vol_sqrt_T * z1);
                double p_pos = calculate_payoff(ST_pos, K, isCall);
                double p_neg = calculate_payoff(ST_neg, K, isCall);
                double pair_avg = 0.5 * (p_pos + p_neg);

                local_sum += p_pos + p_neg;
                local_sum_squared += pair_avg * pair_avg;
            }

            thread_results[t] = {local_sum, local_sum_squared, t_pairs};
        });
    }

    for (auto &th : threads) {
        th.join();
    }

    double total_sum = 0.0;
    double total_sum_squared = 0.0;
    int total_evaluated_pairs = 0;

    for (const auto &res : thread_results) {
        total_sum += res.sum;
        total_sum_squared += res.sum_squared;
        total_evaluated_pairs += res.pairs_count;
    }

    int total_eval_trials = total_evaluated_pairs * 2;
    double mean = total_sum / total_eval_trials;
    double discounted_mean = mean * discount;

    double pair_var = (total_sum_squared / total_evaluated_pairs) - (mean * mean);
    if (pair_var < 0.0) pair_var = 0.0;
    double std_dev = std::sqrt(pair_var);
    double margin_of_error = 1.96 * (std_dev / std::sqrt(static_cast<double>(total_evaluated_pairs))) * discount;

    price = discounted_mean;
    lower = discounted_mean - margin_of_error;
    upper = discounted_mean + margin_of_error;
}

// Multi-threaded Asian Option Pricing (arithmetic average daily steps) with Antithetic Variates
void monte_carlo_asian_option_mt(double S0, double K, double r, double sigma,
                                  double T, bool isCall, int numTrials, int numSteps, int num_threads,
                                  double &price, double &lower, double &upper) {
    if (numSteps <= 0) numSteps = 252;
    if (num_threads <= 0) {
        num_threads = std::thread::hardware_concurrency();
        if (num_threads == 0) num_threads = 4;
    }
    num_threads = std::min(num_threads, std::max(1, numTrials / 2));

    int total_pairs = numTrials / 2;
    int pairs_per_thread = total_pairs / num_threads;
    int remaining_pairs = total_pairs % num_threads;

    const double dt = T / numSteps;
    const double drift = (r - 0.5 * sigma * sigma) * dt;
    const double vol_sqrt_dt = sigma * std::sqrt(dt);
    const double discount = std::exp(-r * T);

    struct ThreadResult {
        double sum;
        double sum_squared;
        int count;
    };

    std::vector<ThreadResult> thread_results(num_threads, {0.0, 0.0, 0});
    std::vector<std::thread> threads;
    threads.reserve(num_threads);

    for (int t = 0; t < num_threads; ++t) {
        int t_pairs = pairs_per_thread + (t < remaining_pairs ? 1 : 0);

        threads.emplace_back([&, t, t_pairs]() {
            Xoshiro256Plus rng = create_seeded_rng(t + 100);
            double local_sum = 0.0;
            double local_sum_squared = 0.0;

            for (int i = 0; i < t_pairs; ++i) {
                double current_pos = S0;
                double current_neg = S0;
                double path_sum_pos = current_pos;
                double path_sum_neg = current_neg;

                for (int step = 0; step < numSteps; ++step) {
                    double z = rng.next_normal();
                    current_pos *= std::exp(drift + vol_sqrt_dt * z);
                    current_neg *= std::exp(drift - vol_sqrt_dt * z);
                    path_sum_pos += current_pos;
                    path_sum_neg += current_neg;
                }

                double avg_pos = path_sum_pos / (numSteps + 1);
                double avg_neg = path_sum_neg / (numSteps + 1);
                double p_pos = calculate_payoff(avg_pos, K, isCall);
                double p_neg = calculate_payoff(avg_neg, K, isCall);
                double pair_avg = 0.5 * (p_pos + p_neg);

                local_sum += p_pos + p_neg;
                local_sum_squared += pair_avg * pair_avg;
            }

            thread_results[t] = {local_sum, local_sum_squared, t_pairs};
        });
    }

    for (auto &th : threads) {
        th.join();
    }

    double total_sum = 0.0;
    double total_sum_squared = 0.0;
    int total_pairs_evaluated = 0;

    for (const auto &res : thread_results) {
        total_sum += res.sum;
        total_sum_squared += res.sum_squared;
        total_pairs_evaluated += res.count;
    }

    double mean = total_sum / (total_pairs_evaluated * 2);
    double discounted_mean = mean * discount;
    double pair_var = (total_sum_squared / total_pairs_evaluated) - (mean * mean);
    if (pair_var < 0.0) pair_var = 0.0;
    double std_dev = std::sqrt(pair_var);
    double margin_of_error = 1.96 * (std_dev / std::sqrt(static_cast<double>(total_pairs_evaluated))) * discount;

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
                                double T, bool isCall, int numTrials, int num_threads) {
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
            Xoshiro256Plus rng = create_seeded_rng(t + 200);

            double sum_base = 0.0;
            double sum_S_up = 0.0;
            double sum_S_down = 0.0;
            double sum_vol_up = 0.0;
            double sum_vol_down = 0.0;
            double sum_T_down = 0.0;
            double sum_r_up = 0.0;
            double sum_r_down = 0.0;

            for (int i = 0; i < count; ++i) {
                const double z = rng.next_normal();

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
std::vector<std::vector<double>> generate_price_paths(double S0, double r, double sigma, double T, int numPaths = 50, int numSteps = 100) {
    std::vector<std::vector<double>> paths(numPaths, std::vector<double>(numSteps + 1, S0));
    double dt = T / numSteps;
    double drift = (r - 0.5 * sigma * sigma) * dt;
    double vol_sqrt_dt = sigma * std::sqrt(dt);

    Xoshiro256Plus rng = create_seeded_rng(42);

    for (int p = 0; p < numPaths; ++p) {
        double S = S0;
        paths[p][0] = S0;
        for (int step = 1; step <= numSteps; ++step) {
            double z = rng.next_normal();
            S *= std::exp(drift + vol_sqrt_dt * z);
            paths[p][step] = S;
        }
    }

    return paths;
}

// Structure to store Hedging Simulation Summary
struct DeltaHedgeResult {
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
                                           int num_threads) {
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
            Xoshiro256Plus rng = create_seeded_rng(t + 500);
            double total_tx_accum = 0.0;

            for (int p = 0; p < t_paths; ++p) {
                double S = S0;
                double shares = delta0;
                double cash = C0;
                double path_tx_cost = cost0;

                for (int step = 1; step <= numSteps; ++step) {
                    double z = rng.next_normal();
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
    Xoshiro256Plus sample_rng = create_seeded_rng(999);

    for (int p = 0; p < sample_count; ++p) {
        std::vector<std::vector<double>> path_steps;
        path_steps.reserve(numSteps + 1);

        double S = S0;
        double delta = delta0;
        double shares = delta0;
        double cash = C0;

        path_steps.push_back({0.0, S, delta, shares, cash, cash + shares * S - V0});

        for (int step = 1; step <= numSteps; ++step) {
            double z = sample_rng.next_normal();
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

int main(int argc, char *argv[]) {
    if (argc < 9) {
        std::cerr << "Usage: " << argv[0] << " <S0> <K> <r> <sigma> <T> <isCall> <numTrials> <benchmark_mode> [threads] [numSteps/iterations] [rebalanceFreq] [txCostPct]" << std::endl;
        return 1;
    }

    try {
        double S0 = std::stod(argv[1]);
        double K = std::stod(argv[2]);
        double r = std::stod(argv[3]);
        double sigma = std::stod(argv[4]);
        double T = std::stod(argv[5]);
        bool isCall = std::stoi(argv[6]) != 0;
        int numTrials = std::stoi(argv[7]);
        int benchmark_mode = std::stoi(argv[8]);

        if (S0 <= 0.0) throw std::invalid_argument("Stock price (S0) must be positive");
        if (K <= 0.0) throw std::invalid_argument("Strike price (K) must be positive");
        if (sigma <= 0.0) throw std::invalid_argument("Volatility (sigma) must be positive");
        if (T <= 0.0) throw std::invalid_argument("Time to maturity (T) must be positive");
        if (numTrials <= 0) throw std::invalid_argument("Number of trials must be positive");

        int threads = 0;
        if (argc > 9) {
            threads = std::stoi(argv[9]);
        }

        if (benchmark_mode == 0) {
            // European Single Run Mode
            auto start_t = std::chrono::high_resolution_clock::now();
            double price, lower, upper;
            if (threads == 1) {
                monte_carlo_black_scholes(S0, K, r, sigma, T, isCall, numTrials, price, lower, upper);
            } else {
                monte_carlo_black_scholes_mt(S0, K, r, sigma, T, isCall, numTrials, threads, price, lower, upper);
            }
            auto end_t = std::chrono::high_resolution_clock::now();
            double exec_ms = std::chrono::duration<double, std::milli>(end_t - start_t).count();

            std::cout << "{\"optionType\":\"european\",\"executionTimeMs\":" << std::fixed << std::setprecision(3) << exec_ms
                      << ",\"optionPrice\":" << std::fixed << std::setprecision(6) << price
                      << ",\"confidence\":{\"lower\":" << lower
                      << ",\"upper\":" << upper
                      << "},\"threadsUsed\":" << threads << "}";
        }
        else if (benchmark_mode == 2) {
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
        else if (benchmark_mode == 3) {
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
        else if (benchmark_mode == 4) {
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
        else if (benchmark_mode == 5) {
            // Delta-Hedging Simulator Mode
            int numSteps = 252;
            int rebalanceFreq = 1;
            double txCostPct = 0.001;

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
        else {
            // Mode 1: Benchmark
            int iterations = 5;
            if (argc > 10) {
                iterations = std::stoi(argv[10]);
            }

            std::vector<double> times;
            times.reserve(iterations);

            // Warm-up
            double price, lower, upper;
            monte_carlo_black_scholes_mt(S0, K, r, sigma, T, isCall, numTrials, threads, price, lower, upper);

            std::cout << "{\"iterations\":" << iterations << ",\"threadsUsed\":" << threads << ",\"runs\":[";

            for (int i = 0; i < iterations; i++) {
                auto start_time = std::chrono::high_resolution_clock::now();
                monte_carlo_black_scholes_mt(S0, K, r, sigma, T, isCall, numTrials, threads, price, lower, upper);
                auto end_time = std::chrono::high_resolution_clock::now();

                double execution_time = std::chrono::duration<double, std::milli>(end_time - start_time).count();
                times.push_back(execution_time);

                std::cout << "{\"iteration\":" << (i + 1)
                          << ",\"executionTime\":" << std::fixed << std::setprecision(3) << execution_time
                          << ",\"optionPrice\":" << std::fixed << std::setprecision(6) << price
                          << ",\"confidence\":{\"lower\":" << lower
                          << ",\"upper\":" << upper
                          << "}}";
                if (i < iterations - 1) std::cout << ",";
            }

            double min_t = *std::min_element(times.begin(), times.end());
            double max_t = *std::max_element(times.begin(), times.end());
            double avg_t = std::accumulate(times.begin(), times.end(), 0.0) / times.size();
            std::sort(times.begin(), times.end());
            double med_t = times[times.size() / 2];

            std::cout << "],\"statistics\":{\"min\":" << std::fixed << std::setprecision(3) << min_t
                      << ",\"max\":" << max_t
                      << ",\"avg\":" << avg_t
                      << ",\"median\":" << med_t
                      << "}}";
        }
    }
    catch (const std::invalid_argument &e) {
        std::cerr << "Error: " << e.what() << std::endl;
        std::cout << "{\"error\":\"" << e.what() << "\"}";
        return 1;
    }
    catch (const std::exception &e) {
        std::cerr << "Error: " << e.what() << std::endl;
        std::cout << "{\"error\":\"An unexpected error occurred\"}";
        return 1;
    }
    return 0;
}