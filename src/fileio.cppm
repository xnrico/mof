export module budget.fileio;

import <string>;
import <fstream>;
import <sstream>;
import <vector>;
import <chrono>;
import <iomanip>;
import budget.manager;
import budget.entry;
import budget.category;
import budget.currency;

export namespace budget {

class FileIO {
public:
    static bool saveBudget(const BudgetManager& manager, const std::string& filename) {
        std::ofstream file(filename);
        if (!file.is_open()) {
            return false;
        }

        // Write header
        file << "ID,Description,Amount,Category,Currency,Timestamp\n";

        // Write entries
        for (const auto& entry : manager.getEntries()) {
            file << entry->getId() << ","
                 << escapeCSV(entry->getDescription()) << ","
                 << entry->getAmount() << ","
                 << CategoryManager::toString(entry->getCategory()) << ","
                 << CurrencyConverter::toString(entry->getCurrency()) << ","
                 << formatTimestamp(entry->getTimestamp()) << "\n";
        }

        file.close();
        return true;
    }

    static bool loadBudget(BudgetManager& manager, const std::string& filename) {
        std::ifstream file(filename);
        if (!file.is_open()) {
            return false;
        }

        manager.clear();

        // Skip header
        std::string line;
        std::getline(file, line);

        // Read entries
        while (std::getline(file, line)) {
            if (line.empty()) continue;

            auto parts = parseCSVLine(line);
            if (parts.size() != 6) continue;

            try {
                std::string id = parts[0];
                std::string description = parts[1];
                double amount = std::stod(parts[2]);
                Category category = CategoryManager::fromString(parts[3]);
                Currency currency = CurrencyConverter::fromString(parts[4]);

                manager.addEntry(std::move(description), amount, category, currency);
            } catch (...) {
                // Skip invalid entries
                continue;
            }
        }

        file.close();
        return true;
    }

private:
    static std::string escapeCSV(const std::string& str) {
        if (str.find(',') != std::string::npos || 
            str.find('"') != std::string::npos || 
            str.find('\n') != std::string::npos) {
            std::string escaped = "\"";
            for (char c : str) {
                if (c == '"') escaped += "\"\"";
                else escaped += c;
            }
            escaped += "\"";
            return escaped;
        }
        return str;
    }

    static std::vector<std::string> parseCSVLine(const std::string& line) {
        std::vector<std::string> parts;
        std::string current;
        bool inQuotes = false;

        for (size_t i = 0; i < line.size(); ++i) {
            char c = line[i];

            if (c == '"') {
                if (inQuotes && i + 1 < line.size() && line[i + 1] == '"') {
                    current += '"';
                    ++i;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (c == ',' && !inQuotes) {
                parts.push_back(current);
                current.clear();
            } else {
                current += c;
            }
        }
        parts.push_back(current);

        return parts;
    }

    static std::string formatTimestamp(const std::chrono::system_clock::time_point& tp) {
        auto time_t = std::chrono::system_clock::to_time_t(tp);
        std::stringstream ss;
        ss << std::put_time(std::localtime(&time_t), "%Y-%m-%d %H:%M:%S");
        return ss.str();
    }
};

} // namespace budget
