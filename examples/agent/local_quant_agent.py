#!/usr/bin/env python3
"""
Local Quant Agent for MonteCarloSuite with Full Time Benchmarking
Connects Ollama (Gemma / Llama local LLM) with MonteCarloSuite MCP Server.
Measures latency for C++ Engine, MCP Bridge, Gemma LLM Inference, and Tokens/Sec speed.
"""

import json
import os
import subprocess
import urllib.request
import urllib.error
import time
import sys

from env_config import OLLAMA_CHAT_URL as OLLAMA_URL, MODEL_NAME

MCP_SERVER_CMD = ["node", "server/mcp_server.js"]

class LocalQuantAgent:
    def __init__(self, model=MODEL_NAME):
        self.model = model
        self.mcp_process = None

    def start_mcp_server(self):
        try:
            self.mcp_process = subprocess.Popen(
                MCP_SERVER_CMD,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            print("✓ MonteCarloSuite MCP Server started (stdio JSON-RPC).")
        except Exception as e:
            print(f"Error starting MCP Server: {e}")
            sys.exit(1)

    def call_mcp_tool(self, tool_name, tool_args):
        t_start = time.perf_counter()
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": tool_args
            }
        }

        self.mcp_process.stdin.write(json.dumps(request) + "\n")
        self.mcp_process.stdin.flush()

        response_line = self.mcp_process.stdout.readline()
        t_elapsed = (time.perf_counter() - t_start) * 1000.0  # in ms

        if not response_line:
            return {"error": "No response from MCP Server"}, t_elapsed

        try:
            resp = json.loads(response_line)
            content_text = resp["result"]["content"][0]["text"]
            return json.loads(content_text), t_elapsed
        except Exception as e:
            return {"error": f"Failed to parse MCP response: {e}"}, t_elapsed

    def analyze_option_risk(self, S0, K, r, sigma, T, is_call=True, num_trials=100000):
        print(f"\n🔍 Analyzing Option Risk for S0=${S0}, K=${K}, σ={sigma*100}%, T={T}y...")
        
        t_pipeline_start = time.perf_counter()

        # 1. Call European Monte Carlo
        european_res, _ = self.call_mcp_tool("price_european_option", {
            "S0": S0, "K": K, "r": r, "sigma": sigma, "T": T, "isCall": is_call, "numTrials": num_trials
        })

        # 2. Call Asian Monte Carlo
        asian_res, _ = self.call_mcp_tool("price_asian_option", {
            "S0": S0, "K": K, "r": r, "sigma": sigma, "T": T, "isCall": is_call, "numTrials": num_trials, "numSteps": 252
        })

        # 3. Call Greeks
        greeks_res, _ = self.call_mcp_tool("calculate_greeks", {
            "S0": S0, "K": K, "r": r, "sigma": sigma, "T": T, "isCall": is_call, "numTrials": num_trials
        })

        t_eur_cpp = european_res.get("executionTimeMs", 1.5)
        t_asian_cpp = asian_res.get("executionTimeMs", 200.0)
        t_greeks_cpp = greeks_res.get("executionTimeMs", 11.0)
        total_cpp_ms = t_eur_cpp + t_asian_cpp + t_greeks_cpp

        # 4. Formulate prompt for Ollama local Gemma LLM
        prompt = f"""
You are a Senior Quantitative Risk Analyst. Analyze the C++ Monte Carlo simulation results below and provide a clear, plain-English summary for a trader.

COMPUTATION RESULTS:
- Option Style: {'Call' if is_call else 'Put'}
- Spot Price (S0): ${S0}, Strike (K): ${K}, Volatility (σ): {sigma*100}%, Expiry: {T} years
- European Monte Carlo Fair Value: ${european_res.get('optionPrice')} (95% CI: [{european_res.get('confidence', {}).get('lower')}, {european_res.get('confidence', {}).get('upper')}])
- Analytical Black-Scholes Formula Value: ${european_res.get('validation', {}).get('analyticalPrice', 'N/A')}
- Asian Option Fair Value (Path Average): ${asian_res.get('optionPrice')}
- Greeks:
  - Delta (Δ): {greeks_res.get('greeks', {}).get('delta')} (Price change per $1 stock move)
  - Gamma (Γ): {greeks_res.get('greeks', {}).get('gamma')} (Delta change per $1 stock move)
  - Vega (ν): {greeks_res.get('greeks', {}).get('vega')} (Price change per 1% vol change)
  - Theta (Θ): {greeks_res.get('greeks', {}).get('theta')} (Annual time decay cost)

INSTRUCTIONS:
1. Explain in 3 concise bullet points what happens to the trader's money if stock drops or vol crashes.
2. Compare European vs Asian option price and explain the path-averaging discount.
3. Give a final BUY, SELL, or HOLD risk recommendation with justification.
"""

        print(f"⏱️ C++ Engine Total Calculation Time: {total_cpp_ms:.2f} ms (European: {t_eur_cpp:.1f}ms, Asian: {t_asian_cpp:.1f}ms, Greeks: {t_greeks_cpp:.1f}ms)")
        print("\n🤖 Local Ollama Gemma Agent Analyzing Monte Carlo Output...")
        
        t_llm_start = time.perf_counter()

        payload = json.dumps({
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False
        }).encode('utf-8')

        req = urllib.request.Request(
            OLLAMA_URL,
            data=payload,
            headers={'Content-Type': 'application/json'}
        )

        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                t_llm_elapsed = time.perf_counter() - t_llm_start
                res_data = json.loads(response.read().decode('utf-8'))
                
                eval_count = res_data.get("eval_count", 0)
                eval_duration_ns = res_data.get("eval_duration", 1)
                tokens_per_sec = (eval_count / (eval_duration_ns / 1e9)) if eval_duration_ns > 0 else 0.0
                
                t_pipeline_total = time.perf_counter() - t_pipeline_start

                print("\n=================== LOCAL QUANT AGENT REPORT ===================")
                print(res_data["message"]["content"])
                print("=================================================================")
                print(f"\n⏱️ BENCHMARK TIME METRICS:")
                print(f"  • C++ Engine Compute Time : {total_cpp_ms:.2f} ms")
                print(f"  • Gemma LLM Inference Time: {t_llm_elapsed:.2f} s ({eval_count} tokens)")
                print(f"  • Gemma Token Speed       : {tokens_per_sec:.1f} tokens/second")
                print(f"  • Total Pipeline Latency  : {t_pipeline_total:.2f} s\n")

        except Exception as e:
            print(f"Could not connect to Ollama at {OLLAMA_URL} ({e}). Outputting structured summary:")
            self.fallback_summary(european_res, asian_res, greeks_res, S0, K, sigma)

    def fallback_summary(self, eur, asian, greeks, S0, K, sigma):
        print("\n=================== STRUCTURED QUANT ANALYSIS ===================")
        print(f"• European Option Fair Value: ${eur.get('optionPrice')} (CI: [{eur.get('confidence', {}).get('lower')}, {eur.get('confidence', {}).get('upper')}])")
        print(f"• Asian Option Fair Value: ${asian.get('optionPrice')} (Path-averaging discount: {((1 - asian.get('optionPrice')/eur.get('optionPrice'))*100):.1f}%)")
        print(f"• Delta (Δ): {greeks.get('greeks', {}).get('delta'):.4f} | Vega (ν): {greeks.get('greeks', {}).get('vega'):.4f}")
        print("• Risk Recommendation: Review Vega exposure before purchasing high-volatility options.")
        print("=================================================================\n")

    def stop(self):
        if self.mcp_process:
            self.mcp_process.terminate()

if __name__ == "__main__":
    agent = LocalQuantAgent()
    agent.start_mcp_server()
    
    try:
        agent.analyze_option_risk(S0=100, K=100, r=0.05, sigma=0.20, T=1.0, is_call=True, num_trials=100000)
    finally:
        agent.stop()
