#include <iostream>
#include <cassert>
#include <string>

import budget.manager;
import budget.category;
import budget.currency;
import budget.fileio;

using namespace budget;

void testBudgetManager() {
    std::cout << "Testing BudgetManager...\n";
    
    BudgetManager manager;
    
    // Test add entry
    std::string id1 = manager.addEntry("Groceries", 50.0, Category::FOOD, Currency::GBP);
    assert(manager.getEntryCount() == 1);
    std::cout << "  ✓ Add entry test passed\n";
    
    // Test add multiple entries
    std::string id2 = manager.addEntry("Bus ticket", 2.5, Category::TRANSPORT, Currency::GBP);
    std::string id3 = manager.addEntry("Rent", 800.0, Category::HOUSING, Currency::GBP);
    assert(manager.getEntryCount() == 3);
    std::cout << "  ✓ Add multiple entries test passed\n";
    
    // Test modify entry
    bool modified = manager.modifyEntry(id1, "Supermarket shopping", 60.0, Category::FOOD, Currency::GBP);
    assert(modified == true);
    std::cout << "  ✓ Modify entry test passed\n";
    
    // Test delete entry
    bool deleted = manager.deleteEntry(id2);
    assert(deleted == true);
    assert(manager.getEntryCount() == 2);
    std::cout << "  ✓ Delete entry test passed\n";
    
    // Test get entries by category
    auto foodEntries = manager.getEntriesByCategory(Category::FOOD);
    assert(foodEntries.size() == 1);
    std::cout << "  ✓ Get entries by category test passed\n";
    
    // Test get total by category
    double total = manager.getTotalByCategory(Category::FOOD, Currency::GBP);
    assert(total == 60.0);
    std::cout << "  ✓ Get total by category test passed\n";
}

void testCurrencyConverter() {
    std::cout << "\nTesting CurrencyConverter...\n";
    
    // Test toString
    assert(CurrencyConverter::toString(Currency::GBP) == "GBP");
    assert(CurrencyConverter::toString(Currency::USD) == "USD");
    std::cout << "  ✓ toString test passed\n";
    
    // Test fromString
    assert(CurrencyConverter::fromString("GBP") == Currency::GBP);
    assert(CurrencyConverter::fromString("USD") == Currency::USD);
    assert(CurrencyConverter::fromString("gbp") == Currency::GBP);
    std::cout << "  ✓ fromString test passed\n";
    
    // Test getSymbol
    assert(CurrencyConverter::getSymbol(Currency::GBP) == "£");
    assert(CurrencyConverter::getSymbol(Currency::USD) == "$");
    std::cout << "  ✓ getSymbol test passed\n";
}

void testCategoryManager() {
    std::cout << "\nTesting CategoryManager...\n";
    
    // Test toString
    assert(CategoryManager::toString(Category::FOOD) == "Food");
    assert(CategoryManager::toString(Category::TRANSPORT) == "Transport");
    std::cout << "  ✓ toString test passed\n";
    
    // Test fromString
    assert(CategoryManager::fromString("Food") == Category::FOOD);
    assert(CategoryManager::fromString("food") == Category::FOOD);
    assert(CategoryManager::fromString("Transport") == Category::TRANSPORT);
    std::cout << "  ✓ fromString test passed\n";
    
    // Test getAllCategories
    auto categories = CategoryManager::getAllCategories();
    assert(categories.size() == 9);
    std::cout << "  ✓ getAllCategories test passed\n";
}

void testFileIO() {
    std::cout << "\nTesting FileIO...\n";
    
    BudgetManager manager;
    manager.addEntry("Test entry 1", 100.0, Category::FOOD, Currency::GBP);
    manager.addEntry("Test entry 2", 50.0, Category::TRANSPORT, Currency::USD);
    
    // Test save
    std::string testFile = "/tmp/test_budget.csv";
    bool saved = FileIO::saveBudget(manager, testFile);
    assert(saved == true);
    std::cout << "  ✓ Save budget test passed\n";
    
    // Test load
    BudgetManager loadedManager;
    bool loaded = FileIO::loadBudget(loadedManager, testFile);
    assert(loaded == true);
    assert(loadedManager.getEntryCount() == 2);
    std::cout << "  ✓ Load budget test passed\n";
}

int main() {
    std::cout << "=== Running Budget Tracker Tests ===\n\n";
    
    try {
        testCurrencyConverter();
        testCategoryManager();
        testBudgetManager();
        testFileIO();
        
        std::cout << "\n=== All Tests Passed! ===\n";
        return 0;
    } catch (const std::exception& e) {
        std::cout << "\n✗ Test failed: " << e.what() << "\n";
        return 1;
    }
}
