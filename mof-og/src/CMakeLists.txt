# Budget Tracker Application

# Main executable
add_executable(mof main.cpp)
target_compile_features(mof PUBLIC cxx_std_23)

# Install target
install(TARGETS mof DESTINATION bin)
