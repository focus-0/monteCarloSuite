cmake_minimum_required(VERSION 3.10)
project(MonteCarloCpp VERSION 1.0)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find packages
find_package(Threads REQUIRED)

# Include FetchContent for downloading dependencies
include(FetchContent)

# Download and configure nlohmann/json
FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.2
)
FetchContent_MakeAvailable(json)

# Add executable
add_executable(monte_carlo src/monte_carlo.cpp)

# Link libraries
target_link_libraries(monte_carlo PRIVATE Threads::Threads nlohmann_json::nlohmann_json)

# Install target
install(TARGETS monte_carlo DESTINATION bin) 