#pragma once

#include <string>
#include <vector>
#include <memory>
#include <algorithm>
#include <stdexcept>

#include "entry.hpp"
#include "category.hpp"
#include "currency.hpp"

namespace budget {

class BudgetManager {
private:
    std::vector<std::unique_ptr<BudgetEntry>> entries_;
    double exchangeRate_ = 1.38; // Default exchange rate GBP to USD
    double babu_income_ = 4500.0; // Monthly income of Babu in GBP
    double mamu_income_ = 3200.0; // Monthly income of Mamu in GBP
    int nextId_ = 1;

public:
    BudgetManager() = default;

    void setExchangeRate(double rate) {
        if (rate <= 0.0) {
            throw std::invalid_argument("Exchange rate must be positive");
        }

        exchangeRate_ = rate;
    }

    double getExchangeRate() const {
        return exchangeRate_;
    }

    std::string addEntry(std::string description, double amount, 
                        Category category, Currency currency) {
        std::string id = std::to_string(nextId_++);
        auto entry = std::make_unique<BudgetEntry>(id, std::move(description), 
                                                   amount, category, currency);
        entries_.push_back(std::move(entry));
        return id;
    }

    bool modifyEntry(const std::string& id, std::string description, 
                    double amount, Category category, Currency currency) {
        auto it = std::find_if(entries_.begin(), entries_.end(),
            [&id](const auto& entry) { return entry->getId() == id; });
        
        if (it != entries_.end()) {
            (*it)->setDescription(std::move(description));
            (*it)->setAmount(amount);
            (*it)->setCategory(category);
            (*it)->setCurrency(currency);
            return true;
        }
        return false;
    }

    bool deleteEntry(const std::string& id) {
        auto it = std::find_if(entries_.begin(), entries_.end(),
            [&id](const auto& entry) { return entry->getId() == id; });
        
        if (it != entries_.end()) {
            entries_.erase(it);
            return true;
        }
        return false;
    }

    const std::vector<std::unique_ptr<BudgetEntry>>& getEntries() const {
        return entries_;
    }

    std::vector<const BudgetEntry*> getEntriesByCategory(Category category) const {
        std::vector<const BudgetEntry*> result;
        for (const auto& entry : entries_) {
            if (entry->getCategory() == category) {
                result.push_back(entry.get());
            }
        }
        return result;
    }

    double getTotalByCategory(Category category, Currency currency) const {
        double total = 0.0;
        for (const auto& entry : entries_) {
            if (entry->getCategory() == category && entry->getCurrency() == currency) {
                total += entry->getAmount();
            }
        }
        return total;
    }

    void clear() {
        entries_.clear();
        nextId_ = 1;
    }

    size_t getEntryCount() const {
        return entries_.size();
    }

    void setBabuIncome(double income) {
        if (income < 0.0) {
            throw std::invalid_argument("Income must be non-negative");
        }
        babu_income_ = income;
    }

    double getBabuIncome() const {
        return babu_income_;
    }

    double getIncome() const {
        return babu_income_ + mamu_income_;
    }

    void setMamuIncome(double income) {
        if (income < 0.0) {
            throw std::invalid_argument("Income must be non-negative");
        }
        mamu_income_ = income;
    }

    double getMamuIncome() const {
        return mamu_income_;
    }
};

} // namespace budget
