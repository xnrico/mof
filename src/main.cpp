import <iostream>;
import <string>;
import <iomanip>;
import <limits>;
import budget.manager;
import budget.category;
import budget.currency;
import budget.fileio;

using namespace budget;

void displayMenu() {
    std::cout << "\n===== Ministry of Finance - Budget Tracker =====\n";
    std::cout << "1. Add Budget Entry\n";
    std::cout << "2. Modify Budget Entry\n";
    std::cout << "3. Delete Budget Entry\n";
    std::cout << "4. View All Entries\n";
    std::cout << "5. View Entries by Category\n";
    std::cout << "6. View Category Summary\n";
    std::cout << "7. Load Budget from File\n";
    std::cout << "8. Save Budget to File\n";
    std::cout << "9. Exit\n";
    std::cout << "===============================================\n";
    std::cout << "Enter your choice: ";
}

void displayCategories() {
    std::cout << "\nAvailable Categories:\n";
    auto categories = CategoryManager::getAllCategories();
    for (size_t i = 0; i < categories.size(); ++i) {
        std::cout << (i + 1) << ". " << CategoryManager::toString(categories[i]) << "\n";
    }
}

Category selectCategory() {
    displayCategories();
    std::cout << "Select category (1-" << CategoryManager::getAllCategories().size() << "): ";
    int choice;
    std::cin >> choice;
    
    auto categories = CategoryManager::getAllCategories();
    if (choice >= 1 && choice <= static_cast<int>(categories.size())) {
        return categories[choice - 1];
    }
    throw std::invalid_argument("Invalid category selection");
}

Currency selectCurrency() {
    std::cout << "\nAvailable Currencies:\n";
    std::cout << "1. GBP (£)\n";
    std::cout << "2. USD ($)\n";
    std::cout << "Select currency (1-2): ";
    int choice;
    std::cin >> choice;
    
    if (choice == 1) return Currency::GBP;
    if (choice == 2) return Currency::USD;
    throw std::invalid_argument("Invalid currency selection");
}

void addEntry(BudgetManager& manager) {
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    
    std::cout << "\n--- Add Budget Entry ---\n";
    std::cout << "Enter description: ";
    std::string description;
    std::getline(std::cin, description);
    
    std::cout << "Enter amount: ";
    double amount;
    std::cin >> amount;
    
    Category category = selectCategory();
    Currency currency = selectCurrency();
    
    std::string id = manager.addEntry(description, amount, category, currency);
    std::cout << "\n✓ Entry added successfully with ID: " << id << "\n";
}

void modifyEntry(BudgetManager& manager) {
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    
    std::cout << "\n--- Modify Budget Entry ---\n";
    std::cout << "Enter entry ID: ";
    std::string id;
    std::getline(std::cin, id);
    
    std::cout << "Enter new description: ";
    std::string description;
    std::getline(std::cin, description);
    
    std::cout << "Enter new amount: ";
    double amount;
    std::cin >> amount;
    
    Category category = selectCategory();
    Currency currency = selectCurrency();
    
    if (manager.modifyEntry(id, description, amount, category, currency)) {
        std::cout << "\n✓ Entry modified successfully\n";
    } else {
        std::cout << "\n✗ Entry not found\n";
    }
}

void deleteEntry(BudgetManager& manager) {
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    
    std::cout << "\n--- Delete Budget Entry ---\n";
    std::cout << "Enter entry ID: ";
    std::string id;
    std::getline(std::cin, id);
    
    if (manager.deleteEntry(id)) {
        std::cout << "\n✓ Entry deleted successfully\n";
    } else {
        std::cout << "\n✗ Entry not found\n";
    }
}

void viewAllEntries(const BudgetManager& manager) {
    std::cout << "\n--- All Budget Entries ---\n";
    
    if (manager.getEntryCount() == 0) {
        std::cout << "No entries found.\n";
        return;
    }
    
    std::cout << std::left << std::setw(12) << "ID" 
              << std::setw(30) << "Description" 
              << std::setw(10) << "Amount" 
              << std::setw(15) << "Category"
              << std::setw(10) << "Currency" << "\n";
    std::cout << std::string(77, '-') << "\n";
    
    for (const auto& entry : manager.getEntries()) {
        std::cout << std::left << std::setw(12) << entry->getId()
                  << std::setw(30) << entry->getDescription().substr(0, 28)
                  << std::right << std::setw(10) << std::fixed << std::setprecision(2) << entry->getAmount()
                  << std::left << std::setw(15) << (" " + CategoryManager::toString(entry->getCategory()))
                  << std::setw(10) << CurrencyConverter::toString(entry->getCurrency()) << "\n";
    }
}

void viewEntriesByCategory(const BudgetManager& manager) {
    std::cout << "\n--- View Entries by Category ---\n";
    Category category = selectCategory();
    
    auto entries = manager.getEntriesByCategory(category);
    
    if (entries.empty()) {
        std::cout << "\nNo entries found for " << CategoryManager::toString(category) << ".\n";
        return;
    }
    
    std::cout << "\n" << CategoryManager::toString(category) << " Entries:\n";
    std::cout << std::left << std::setw(12) << "ID" 
              << std::setw(30) << "Description" 
              << std::setw(10) << "Amount" 
              << std::setw(10) << "Currency" << "\n";
    std::cout << std::string(62, '-') << "\n";
    
    for (const auto* entry : entries) {
        std::cout << std::left << std::setw(12) << entry->getId()
                  << std::setw(30) << entry->getDescription().substr(0, 28)
                  << std::right << std::setw(10) << std::fixed << std::setprecision(2) << entry->getAmount()
                  << std::left << std::setw(10) << (" " + CurrencyConverter::toString(entry->getCurrency())) << "\n";
    }
}

void viewCategorySummary(const BudgetManager& manager) {
    std::cout << "\n--- Category Summary ---\n";
    Currency currency = selectCurrency();
    
    std::cout << "\nSummary for " << CurrencyConverter::toString(currency) << ":\n";
    std::cout << std::left << std::setw(20) << "Category" 
              << std::right << std::setw(15) << "Total" << "\n";
    std::cout << std::string(35, '-') << "\n";
    
    double grandTotal = 0.0;
    for (auto category : CategoryManager::getAllCategories()) {
        double total = manager.getTotalByCategory(category, currency);
        if (total > 0.0) {
            std::cout << std::left << std::setw(20) << CategoryManager::toString(category)
                      << std::right << std::setw(15) << std::fixed << std::setprecision(2) 
                      << CurrencyConverter::getSymbol(currency) << total << "\n";
            grandTotal += total;
        }
    }
    
    std::cout << std::string(35, '-') << "\n";
    std::cout << std::left << std::setw(20) << "Grand Total"
              << std::right << std::setw(15) << std::fixed << std::setprecision(2) 
              << CurrencyConverter::getSymbol(currency) << grandTotal << "\n";
}

void loadBudget(BudgetManager& manager) {
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    
    std::cout << "\n--- Load Budget from File ---\n";
    std::cout << "Enter filename (default: data/budget.csv): ";
    std::string filename;
    std::getline(std::cin, filename);
    
    if (filename.empty()) {
        filename = "data/budget.csv";
    }
    
    if (FileIO::loadBudget(manager, filename)) {
        std::cout << "\n✓ Budget loaded successfully from " << filename << "\n";
        std::cout << "Loaded " << manager.getEntryCount() << " entries.\n";
    } else {
        std::cout << "\n✗ Failed to load budget from " << filename << "\n";
    }
}

void saveBudget(const BudgetManager& manager) {
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    
    std::cout << "\n--- Save Budget to File ---\n";
    std::cout << "Enter filename (default: data/budget.csv): ";
    std::string filename;
    std::getline(std::cin, filename);
    
    if (filename.empty()) {
        filename = "data/budget.csv";
    }
    
    if (FileIO::saveBudget(manager, filename)) {
        std::cout << "\n✓ Budget saved successfully to " << filename << "\n";
    } else {
        std::cout << "\n✗ Failed to save budget to " << filename << "\n";
    }
}

int main() {
    BudgetManager manager;
    
    std::cout << "Welcome to Ministry of Finance Budget Tracker!\n";
    std::cout << "Manage your family budget with ease.\n";
    
    bool running = true;
    while (running) {
        try {
            displayMenu();
            int choice;
            std::cin >> choice;
            
            if (std::cin.fail()) {
                std::cin.clear();
                std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
                std::cout << "\n✗ Invalid input. Please enter a number.\n";
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
                    std::cout << "\nThank you for using Ministry of Finance Budget Tracker!\n";
                    running = false;
                    break;
                default:
                    std::cout << "\n✗ Invalid choice. Please try again.\n";
            }
        } catch (const std::exception& e) {
            std::cout << "\n✗ Error: " << e.what() << "\n";
            std::cin.clear();
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
        }
    }
    
    return 0;
}
