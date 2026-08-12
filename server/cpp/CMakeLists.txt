cmake_minimum_required(VERSION 3.10)
project(MonteCarloCpp VERSION 1.0)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Add portable optimization flags (avoid -march=native which causes SIGILL under Rosetta/arm64 mismatches)
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3")

# Find packages
find_package(Threads REQUIRED)

# Add executable
add_executable(monte_carlo src/monte_carlo.cpp)

# Link libraries
target_link_libraries(monte_carlo PRIVATE Threads::Threads)

# Install target
install(TARGETS monte_carlo DESTINATION bin)