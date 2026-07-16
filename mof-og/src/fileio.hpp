#pragma once

#include <string>
#include <fstream>
#include <sstream>
#include <vector>
#include <chrono>
#include <iomanip>

#include "manager.hpp"
#include "category.hpp"
#include "currency.hpp"
#include "entry.hpp"

namespace budget {

class FileIO {
private:
    static constexpr const char* METADATA_PREFIX = "#META:";

public:
    static bool saveBudget(const BudgetManager& manager, const std::string& filename) {
        std::ofstream file(filename);
        if (!file.is_open()) {
            return false;
        }

        // Write metadata (exchange rate and income values)
        file << METADATA_PREFIX << "EXCHANGE_RATE," << manager.getExchangeRate() << "\n";
        file << METADATA_PREFIX << "BABU_INCOME," << manager.getBabuIncome() << "\n";
        file << METADATA_PREFIX << "MAMU_INCOME," << manager.getMamuIncome() << "\n";

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

        std::string line;
        bool headerSkipped = false;

        // Read file line by line
        while (std::getline(file, line)) {
            if (line.empty()) continue;

            // Check for metadata lines
            if (line.rfind(METADATA_PREFIX, 0) == 0) {
                parseMetadataLine(manager, line.substr(strlen(METADATA_PREFIX)));
                continue;
            }

            // Skip header line (starts with "ID,")
            if (!headerSkipped && line.rfind("ID,", 0) == 0) {
                headerSkipped = true;
                continue;
            }

            // Parse entry line
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
    static void parseMetadataLine(BudgetManager& manager, const std::string& metaLine) {
        auto parts = parseCSVLine(metaLine);
        if (parts.size() != 2) return;

        try {
            const std::string& key = parts[0];
            double value = std::stod(parts[1]);

            if (key == "EXCHANGE_RATE") {
                manager.setExchangeRate(value);
            } else if (key == "BABU_INCOME") {
                manager.setBabuIncome(value);
            } else if (key == "MAMU_INCOME") {
                manager.setMamuIncome(value);
            }
        } catch (...) {
            // Ignore invalid metadata, use defaults
        }
    }

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
