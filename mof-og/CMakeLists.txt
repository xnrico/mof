cmake_minimum_required(VERSION 3.28)

# C++20 modules require Ninja generator
if(NOT CMAKE_GENERATOR MATCHES "Ninja")
    message(FATAL_ERROR 
        "C++ modules require the Ninja generator.\n"
        "Please reconfigure with: cmake -G Ninja -B build\n"
        "Or use the preset: cmake --preset macos-llvm"
    )
endif()

project(MoF VERSION 1.0.0 LANGUAGES CXX)

# Set C++23 standard
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# macOS-specific configuration
if(APPLE)
    # Auto-detect SDK path if not set (needed for Homebrew LLVM)
    if(NOT CMAKE_OSX_SYSROOT)
        execute_process(
            COMMAND xcrun --show-sdk-path
            OUTPUT_VARIABLE CMAKE_OSX_SYSROOT
            OUTPUT_STRIP_TRAILING_WHITESPACE
        )
    endif()
    
    # Check if using Homebrew LLVM (required for C++ modules on macOS)
    if(CMAKE_CXX_COMPILER_ID STREQUAL "AppleClang")
        message(FATAL_ERROR
            "Apple Clang does not support C++ modules dependency scanning.\n"
            "Please install and use Homebrew LLVM:\n"
            "  brew install llvm\n"
            "Then reconfigure with:\n"
            "  cmake -G Ninja -B build \\\n"
            "    -DCMAKE_CXX_COMPILER=/opt/homebrew/opt/llvm/bin/clang++\n"
            "Or use the preset: cmake --preset macos-llvm"
        )
    endif()
    
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# Output directories
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${PROJECT_SOURCE_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${PROJECT_SOURCE_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${PROJECT_SOURCE_DIR}/lib)

# Add source directory
add_subdirectory(src)

# Enable testing
enable_testing()
add_subdirectory(test)
