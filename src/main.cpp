#include <iostream>
#include <string>
#include <limits>
#include <print>

#include "manager.hpp"
#include "category.hpp"
#include "currency.hpp"
#include "fileio.hpp"

using namespace budget;

void displayMenu() {
    std::print("\n===== Ministry of Finance - Budget Tracker =====\n");
    std::print("1. Add Budget Entry\n");
    std::print("2. Modify Budget Entry\n");
    std::print("3. Delete Budget Entry\n");
    std::print("4. View All Entries\n");
    std::print("5. View Entries by Category\n");
    std::print("6. View Category Summary\n");
    std::print("7. Load Budget from File\n");
    std::print("8. Save Budget to File\n");
    std::print("9. Exit\n");
    std::print("===============================================\n");
    std::print("Enter your choice: ");
}

void displayCategories() {
    std::print("\nAvailable Categories:\n");
    auto categories = CategoryManager::getAllCategories();
    for (size_t i = 0; i < categories.size(); ++i) {
        std::print("{}. {}\n", i + 1, CategoryManager::toString(categories[i]));
    }
}

Category selectCategory() {
    displayCategories();
    std::print("Select category (1-{}): ", CategoryManager::getAllCategories().size());
    int choice;
    std::cin >> choice;
    
    auto categories = CategoryManager::getAllCategories();
    if (choice >= 1 && choice <= static_cast<int>(categories.size())) {
        return categories[choice - 1];
    }
    throw std::invalid_argument("Invalid category selection");
}

Currency selectCurrency() {
    std::print("\nAvailable Currencies:\n");
    std::print("1. GBP (£)\n");
    std::print("2. USD ($)\n");
    std::print("Select currency (1-2): ");
    int choice;
    std::cin >> choice;
    
    if (choice == 1) return Currency::GBP;
    if (choice == 2) return Currency::USD;
    throw std::invalid_argument("Invalid currency selection");
}

void addEntry(BudgetManager& manager) {
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    
    std::print("\n--- Add Budget Entry ---\n");
    std::print("Enter description: ");
    std::string description;
    std::getline(std::cin, description);
    
    std::print("Enter amount: ");
    double amount;
    std::cin >> amount;
    
    Category category = selectCategory();
    Currency currency = selectCurrency();
    
    std::string id = manager.addEntry(description, amount, category, currency);
    std::print("\n✓ Entry added successfully with ID: {}\n", id);
}

void modifyEntry(BudgetManager& manager) {
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    
    std::print("\n--- Modify Budget Entry ---\n");
    std::print("Enter entry ID: ");
    std::string id;
    std::getline(std::cin, id);
    
    std::print("Enter new description: ");
    std::string description;
    std::getline(std::cin, description);
    
    std::print("Enter new amount: ");
    double amount;
    std::cin >> amount;
    
    Category category = selectCategory();
    Currency currency = selectCurrency();
    
    if (manager.modifyEntry(id, description, amount, category, currency)) {
        std::print("\n✓ Entry modified successfully\n");
    } else {
        std::print("\n✗ Entry not found\n");
    }
}

void deleteEntry(BudgetManager& manager) {
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    
    std::print("\n--- Delete Budget Entry ---\n");
    std::print("Enter entry ID: ");
    std::string id;
    std::getline(std::cin, id);
    
    if (manager.deleteEntry(id)) {
        std::print("\n✓ Entry deleted successfully\n");
    } else {
        std::print("\n✗ Entry not found\n");
    }
}

void viewAllEntries(const BudgetManager& manager) {
    std::print("\n--- All Budget Entries ---\n");
    
    if (manager.getEntryCount() == 0) {
        std::print("\nNo entries found.\n");
        return;
    }
    
    std::print("{:<12}{:<30}{:>10}{:<15}{:<10}\n", "ID", "Description", "Amount", "Category", "Currency");
    std::print("{}\n", std::string(77, '-'));
    
    for (const auto& entry : manager.getEntries()) {
        std::print("{:<12}{:<30}{:>10.2f} {:<14}{:<10}\n",
                   entry->getId(),
                   entry->getDescription().substr(0, 28),
                   entry->getAmount(),
                   CategoryManager::toString(entry->getCategory()),
                   CurrencyConverter::toString(entry->getCurrency()));
    }
}

void viewEntriesByCategory(const BudgetManager& manager) {
    std::print("\n--- View Entries by Category ---\n");
    Category category = selectCategory();
    
    auto entries = manager.getEntriesByCategory(category);
    
    if (entries.empty()) {
        std::print("\nNo entries found for {}.\n", CategoryManager::toString(category));
        return;
    }
    
    std::print("\n{} Entries:\n", CategoryManager::toString(category));
    std::print("{:<12}{:<30}{:>10}{:<10}\n", "ID", "Description", "Amount", "Currency");
    std::print("{}\n", std::string(62, '-'));
    
    for (const auto* entry : entries) {
        std::print("{:<12}{:<30}{:>10.2f} {:<9}\n",
                   entry->getId(),
                   entry->getDescription().substr(0, 28),
                   entry->getAmount(),
                   CurrencyConverter::toString(entry->getCurrency()));
    }
}

void viewCategorySummary(const BudgetManager& manager) {
    std::print("\n--- Category Summary ---\n");
    Currency currency = selectCurrency();
    
    std::print("\nSummary for {}:\n", CurrencyConverter::toString(currency));
    std::print("{:<20}{:>15}\n", "Category", "Total");
    std::print("{}\n", std::string(35, '-'));
    
    double grandTotal = 0.0;
    for (auto category : CategoryManager::getAllCategories()) {
        double total = manager.getTotalByCategory(category, currency);
        if (total > 0.0) {
            std::print("{:<20}{}{:>14.2f}\n",
                       CategoryManager::toString(category),
                       CurrencyConverter::getSymbol(currency),
                       total);
            grandTotal += total;
        }
    }
    
    std::print("{}\n", std::string(35, '-'));
    std::print("{:<20}{}{:>14.2f}\n",
               "Grand Total",
               CurrencyConverter::getSymbol(currency),
               grandTotal);
}

void loadBudget(BudgetManager& manager) {
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    
    std::print("\n--- Load Budget from File ---\n");
    std::print("Enter filename (default: data/budget.csv): ");
    std::string filename;
    std::getline(std::cin, filename);
    
    if (filename.empty()) {
        filename = "data/budget.csv";
    }
    
    if (FileIO::loadBudget(manager, filename)) {
        std::print("\n✓ Budget loaded successfully from {}\n", filename);
        std::print("Loaded {} entries.\n", manager.getEntryCount());
    } else {
        std::print("\n✗ Failed to load budget from {}\n", filename);
    }
}

void saveBudget(const BudgetManager& manager) {
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    
    std::print("\n--- Save Budget to File ---\n");
    std::print("Enter filename (default: data/budget.csv): ");
    std::string filename;
    std::getline(std::cin, filename);
    
    if (filename.empty()) {
        filename = "data/budget.csv";
    }
    
    if (FileIO::saveBudget(manager, filename)) {
        std::print("\n✓ Budget saved successfully to {}\n", filename);
    } else {
        std::print("\n✗ Failed to save budget to {}\n", filename);
    }
}

int main() {
    BudgetManager manager;
    
    std::print("Welcome to Ministry of Finance Budget Tracker!\n");
    std::print("Manage your family budget with ease.\n");
    
    bool running = true;
    while (running) {
        try {
            displayMenu();
            int choice;
            std::cin >> choice;
            
            if (std::cin.fail()) {
                std::cin.clear();
                std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
                std::print("\n✗ Invalid input. Please enter a number.\n");
                continue;
            }
            
            switch (choice) {
                case 1:
                    addEntry(manager);
                    break;
                case 2:
                    modifyEntry(manager);
                    break;
                case 3:
                    deleteEntry(manager);
                    break;
                case 4:
                    viewAllEntries(manager);
                    break;
                case 5:
                    viewEntriesByCategory(manager);
                    break;
                case 6:
                    viewCategorySummary(manager);
                    break;
                case 7:
                    loadBudget(manager);
                    break;
                case 8:
                    saveBudget(manager);
                    break;
                case 9:
                    std::print("\nThank you for using Ministry of Finance Budget Tracker!\n");
                    running = false;
                    break;
                default:
                    std::print("\n✗ Invalid choice. Please try again.\n");
            }
        } catch (const std::exception& e) {
            std::print("\n✗ Error: {}\n", e.what());
            std::cin.clear();
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
        }
    }
    
    return 0;
}
