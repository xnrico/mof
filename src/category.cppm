export module budget.category;

import <string>;
import <string_view>;
import <vector>;
import <stdexcept>;

export namespace budget {

enum class Category {
    FOOD,
    TRANSPORT,
    HOUSING,
    ENTERTAINMENT,
    UTILITIES,
    HEALTHCARE,
    EDUCATION,
    SAVINGS,
    OTHER
};

class CategoryManager {
public:
    static std::string toString(Category category) {
        switch (category) {
            case Category::FOOD: return "Food";
            case Category::TRANSPORT: return "Transport";
            case Category::HOUSING: return "Housing";
            case Category::ENTERTAINMENT: return "Entertainment";
            case Category::UTILITIES: return "Utilities";
            case Category::HEALTHCARE: return "Healthcare";
            case Category::EDUCATION: return "Education";
            case Category::SAVINGS: return "Savings";
            case Category::OTHER: return "Other";
        }
        throw std::invalid_argument("Invalid category");
    }

    static Category fromString(std::string_view str) {
        if (str == "Food" || str == "food") return Category::FOOD;
        if (str == "Transport" || str == "transport") return Category::TRANSPORT;
        if (str == "Housing" || str == "housing") return Category::HOUSING;
        if (str == "Entertainment" || str == "entertainment") return Category::ENTERTAINMENT;
        if (str == "Utilities" || str == "utilities") return Category::UTILITIES;
        if (str == "Healthcare" || str == "healthcare") return Category::HEALTHCARE;
        if (str == "Education" || str == "education") return Category::EDUCATION;
        if (str == "Savings" || str == "savings") return Category::SAVINGS;
        if (str == "Other" || str == "other") return Category::OTHER;
        throw std::invalid_argument("Invalid category string");
    }

    static std::vector<Category> getAllCategories() {
        return {
            Category::FOOD,
            Category::TRANSPORT,
            Category::HOUSING,
            Category::ENTERTAINMENT,
            Category::UTILITIES,
            Category::HEALTHCARE,
            Category::EDUCATION,
            Category::SAVINGS,
            Category::OTHER
        };
    }
};

} // namespace budget
