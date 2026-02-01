export module budget.entry;

import <string>;
import <chrono>;
import budget.category;
import budget.currency;

export namespace budget {

class BudgetEntry {
private:
    std::string id_;
    std::string description_;
    double amount_;
    Category category_;
    Currency currency_;
    std::chrono::system_clock::time_point timestamp_;

public:
    BudgetEntry(std::string id, std::string description, double amount, 
                Category category, Currency currency)
        : id_(std::move(id))
        , description_(std::move(description))
        , amount_(amount)
        , category_(category)
        , currency_(currency)
        , timestamp_(std::chrono::system_clock::now()) {}

    // Getters
    const std::string& getId() const { return id_; }
    const std::string& getDescription() const { return description_; }
    double getAmount() const { return amount_; }
    Category getCategory() const { return category_; }
    Currency getCurrency() const { return currency_; }
    const std::chrono::system_clock::time_point& getTimestamp() const { return timestamp_; }

    // Setters
    void setDescription(std::string description) { description_ = std::move(description); }
    void setAmount(double amount) { amount_ = amount; }
    void setCategory(Category category) { category_ = category; }
    void setCurrency(Currency currency) { currency_ = currency; }
    void setTimestamp(std::chrono::system_clock::time_point timestamp) { timestamp_ = timestamp; }
};

} // namespace budget
