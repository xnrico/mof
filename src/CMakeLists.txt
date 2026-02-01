# Budget Tracker Application

# Create module library
add_library(budget_modules)

target_sources(budget_modules
    PUBLIC
        FILE_SET CXX_MODULES FILES
            currency.cppm
            category.cppm
            entry.cppm
            manager.cppm
            fileio.cppm
)

target_compile_features(budget_modules PUBLIC cxx_std_23)

# Main executable
add_executable(mof main.cpp)

target_link_libraries(mof PRIVATE budget_modules)
target_compile_features(mof PUBLIC cxx_std_23)

# Install target
install(TARGETS mof DESTINATION bin)
