# Budget Tracker Tests

add_executable(test_budget test_budget.cpp)

target_link_libraries(test_budget PRIVATE budget_modules)
target_compile_features(test_budget PUBLIC cxx_std_23)

# Add test
add_test(NAME BudgetTrackerTests COMMAND test_budget)
