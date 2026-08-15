#include <napi.h>
#include "monte_carlo_core.h"
#include <chrono>

// Helper to get number from Napi::Object or default
inline double get_double(Napi::Object obj, const std::string &key, double def) {
    if (obj.Has(key) && obj.Get(key).IsNumber()) {
        return obj.Get(key).As<Napi::Number>().DoubleValue();
    }
    return def;
}

inline int get_int(Napi::Object obj, const std::string &key, int def) {
    if (obj.Has(key) && obj.Get(key).IsNumber()) {
        return obj.Get(key).As<Napi::Number>().Int32Value();
    }
    return def;
}

inline bool get_bool(Napi::Object obj, const std::string &key, bool def) {
    if (obj.Has(key)) {
        Napi::Value val = obj.Get(key);
        if (val.IsBoolean()) return val.As<Napi::Boolean>().Value();
        if (val.IsNumber()) return val.As<Napi::Number>().Int32Value() != 0;
        if (val.IsString()) {
            std::string s = val.As<Napi::String>().Utf8Value();
            return s == "true" || s == "1" || s == "TRUE";
        }
    }
    return def;
}

// 1. In-Process European Option Pricing
Napi::Value CalculateOptionPriceWrapped(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Object expected with simulation parameters").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object params = info[0].As<Napi::Object>();
    double S0 = get_double(params, "S0", 100.0);
    double K = get_double(params, "K", 100.0);
    double r = get_double(params, "r", 0.05);
    double sigma = get_double(params, "sigma", 0.20);
    double T = get_double(params, "T", 1.0);
    bool isCall = get_bool(params, "isCall", true);
    int numTrials = get_int(params, "numTrials", 100000);
    int threads = get_int(params, "threads", 0);

    auto start = std::chrono::high_resolution_clock::now();
    double price = 0.0, lower = 0.0, upper = 0.0;

    try {
        monte_carlo_black_scholes_mt(S0, K, r, sigma, T, isCall, numTrials, threads, price, lower, upper);
    } catch (const std::exception &e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }

    auto end = std::chrono::high_resolution_clock::now();
    double executionTimeMs = std::chrono::duration<double, std::milli>(end - start).count();

    Napi::Object result = Napi::Object::New(env);
    result.Set("optionPrice", Napi::Number::New(env, price));
    
    Napi::Object conf = Napi::Object::New(env);
    conf.Set("lower", Napi::Number::New(env, lower));
    conf.Set("upper", Napi::Number::New(env, upper));
    result.Set("confidence", conf);

    result.Set("executionTimeMs", Napi::Number::New(env, executionTimeMs));
    result.Set("numTrials", Napi::Number::New(env, numTrials));
    result.Set("engine", Napi::String::New(env, "cpp-napi"));
    result.Set("threadsUsed", Napi::Number::New(env, threads > 0 ? threads : std::thread::hardware_concurrency()));

    return result;
}

// 2. In-Process Asian Option Pricing
Napi::Value CalculateAsianOptionPriceWrapped(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Object expected with parameters").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object params = info[0].As<Napi::Object>();
    double S0 = get_double(params, "S0", 100.0);
    double K = get_double(params, "K", 100.0);
    double r = get_double(params, "r", 0.05);
    double sigma = get_double(params, "sigma", 0.20);
    double T = get_double(params, "T", 1.0);
    bool isCall = get_bool(params, "isCall", true);
    int numTrials = get_int(params, "numTrials", 100000);
    int numSteps = get_int(params, "numSteps", 252);
    int threads = get_int(params, "threads", 0);

    auto start = std::chrono::high_resolution_clock::now();
    double price = 0.0, lower = 0.0, upper = 0.0;

    try {
        monte_carlo_asian_option_mt(S0, K, r, sigma, T, isCall, numTrials, numSteps, threads, price, lower, upper);
    } catch (const std::exception &e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }

    auto end = std::chrono::high_resolution_clock::now();
    double executionTimeMs = std::chrono::duration<double, std::milli>(end - start).count();

    Napi::Object result = Napi::Object::New(env);
    result.Set("optionPrice", Napi::Number::New(env, price));
    result.Set("optionType", Napi::String::New(env, "asian"));
    result.Set("numSteps", Napi::Number::New(env, numSteps));

    Napi::Object conf = Napi::Object::New(env);
    conf.Set("lower", Napi::Number::New(env, lower));
    conf.Set("upper", Napi::Number::New(env, upper));
    result.Set("confidence", conf);

    result.Set("executionTimeMs", Napi::Number::New(env, executionTimeMs));
    result.Set("numTrials", Napi::Number::New(env, numTrials));
    result.Set("engine", Napi::String::New(env, "cpp-napi"));

    return result;
}

// 3. In-Process Greeks Calculation
Napi::Value CalculateGreeksWrapped(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Object expected with parameters").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object params = info[0].As<Napi::Object>();
    double S0 = get_double(params, "S0", 100.0);
    double K = get_double(params, "K", 100.0);
    double r = get_double(params, "r", 0.05);
    double sigma = get_double(params, "sigma", 0.20);
    double T = get_double(params, "T", 1.0);
    bool isCall = get_bool(params, "isCall", true);
    int numTrials = get_int(params, "numTrials", 100000);
    int threads = get_int(params, "threads", 0);

    auto start = std::chrono::high_resolution_clock::now();
    GreeksResult greeks;

    try {
        greeks = calculate_greeks_mt(S0, K, r, sigma, T, isCall, numTrials, threads);
    } catch (const std::exception &e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }

    auto end = std::chrono::high_resolution_clock::now();
    double executionTimeMs = std::chrono::duration<double, std::milli>(end - start).count();

    Napi::Object result = Napi::Object::New(env);
    result.Set("optionPrice", Napi::Number::New(env, greeks.basePrice));
    
    Napi::Object greeksObj = Napi::Object::New(env);
    greeksObj.Set("delta", Napi::Number::New(env, greeks.delta));
    greeksObj.Set("gamma", Napi::Number::New(env, greeks.gamma));
    greeksObj.Set("vega", Napi::Number::New(env, greeks.vega));
    greeksObj.Set("theta", Napi::Number::New(env, greeks.theta));
    greeksObj.Set("rho", Napi::Number::New(env, greeks.rho));
    result.Set("greeks", greeksObj);

    result.Set("executionTimeMs", Napi::Number::New(env, executionTimeMs));
    result.Set("numTrials", Napi::Number::New(env, numTrials));
    result.Set("engine", Napi::String::New(env, "cpp-napi"));

    return result;
}

// 4. In-Process Price Paths Generation
Napi::Value GeneratePricePathsWrapped(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    Napi::Object params = info.Length() > 0 && info[0].IsObject() ? info[0].As<Napi::Object>() : Napi::Object::New(env);

    double S0 = get_double(params, "S0", 100.0);
    double r = get_double(params, "r", 0.05);
    double sigma = get_double(params, "sigma", 0.20);
    double T = get_double(params, "T", 1.0);
    int numPaths = get_int(params, "numPaths", 50);
    int numSteps = get_int(params, "numSteps", 100);

    auto start = std::chrono::high_resolution_clock::now();
    auto rawPaths = generate_price_paths_core(S0, r, sigma, T, numPaths, numSteps);
    auto end = std::chrono::high_resolution_clock::now();

    Napi::Array pathsArray = Napi::Array::New(env, rawPaths.size());
    for (size_t i = 0; i < rawPaths.size(); ++i) {
        Napi::Array stepArray = Napi::Array::New(env, rawPaths[i].size());
        for (size_t s = 0; s < rawPaths[i].size(); ++s) {
            stepArray.Set(s, Napi::Number::New(env, rawPaths[i][s]));
        }
        pathsArray.Set(i, stepArray);
    }

    Napi::Object result = Napi::Object::New(env);
    result.Set("paths", pathsArray);
    result.Set("numPaths", Napi::Number::New(env, numPaths));
    result.Set("numSteps", Napi::Number::New(env, numSteps));
    result.Set("executionTimeMs", Napi::Number::New(env, std::chrono::duration<double, std::milli>(end - start).count()));
    result.Set("engine", Napi::String::New(env, "cpp-napi"));

    return result;
}

// 5. In-Process Discrete Delta-Hedging Simulation
Napi::Value SimulateDeltaHedgingWrapped(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Object expected with parameters").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object params = info[0].As<Napi::Object>();
    double S0 = get_double(params, "S0", 100.0);
    double K = get_double(params, "K", 100.0);
    double r = get_double(params, "r", 0.05);
    double sigma = get_double(params, "sigma", 0.20);
    double T = get_double(params, "T", 1.0);
    bool isCall = get_bool(params, "isCall", true);
    int numTrials = get_int(params, "numTrials", 5000);
    int numSteps = get_int(params, "numSteps", 252);
    int rebalanceFreq = get_int(params, "rebalanceFreq", 1);
    double txCostPct = get_double(params, "txCostPct", 0.001);
    int threads = get_int(params, "threads", 0);

    auto start = std::chrono::high_resolution_clock::now();
    DeltaHedgeResult res;

    try {
        res = simulate_delta_hedging_core(S0, K, r, sigma, T, isCall, numTrials, numSteps, rebalanceFreq, txCostPct, threads);
    } catch (const std::exception &e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }

    auto end = std::chrono::high_resolution_clock::now();
    double executionTimeMs = std::chrono::duration<double, std::milli>(end - start).count();

    Napi::Object result = Napi::Object::New(env);
    
    Napi::Object stats = Napi::Object::New(env);
    stats.Set("meanPnL", Napi::Number::New(env, res.meanPnL));
    stats.Set("stdDevPnL", Napi::Number::New(env, res.stdDevPnL));
    stats.Set("minPnL", Napi::Number::New(env, res.minPnL));
    stats.Set("maxPnL", Napi::Number::New(env, res.maxPnL));
    stats.Set("var95", Napi::Number::New(env, res.var95));
    stats.Set("cvar95", Napi::Number::New(env, res.cvar95));
    stats.Set("avgTxCosts", Napi::Number::New(env, res.avgTxCosts));
    result.Set("summaryStatistics", stats);

    Napi::Array pnlArray = Napi::Array::New(env, res.pnlDistribution.size());
    for (size_t i = 0; i < res.pnlDistribution.size(); ++i) {
        pnlArray.Set(i, Napi::Number::New(env, res.pnlDistribution[i]));
    }
    result.Set("pnlDistribution", pnlArray);

    result.Set("numPaths", Napi::Number::New(env, numTrials));
    result.Set("numSteps", Napi::Number::New(env, numSteps));
    result.Set("rebalanceFreq", Napi::Number::New(env, rebalanceFreq));
    result.Set("executionTimeMs", Napi::Number::New(env, executionTimeMs));
    result.Set("engine", Napi::String::New(env, "cpp-napi"));

    return result;
}

// Module Registration
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("calculateOptionPrice", Napi::Function::New(env, CalculateOptionPriceWrapped));
    exports.Set("calculateAsianOptionPrice", Napi::Function::New(env, CalculateAsianOptionPriceWrapped));
    exports.Set("calculateGreeks", Napi::Function::New(env, CalculateGreeksWrapped));
    exports.Set("generatePricePaths", Napi::Function::New(env, GeneratePricePathsWrapped));
    exports.Set("simulateDeltaHedging", Napi::Function::New(env, SimulateDeltaHedgingWrapped));
    return exports;
}

NODE_API_MODULE(monte_carlo_addon, Init)
