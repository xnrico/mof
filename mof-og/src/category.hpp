#pragma once

#include <string>
#include <string_view>
#include <vector>
#include <stdexcept>

namespace budget {

enum class Category {
    FOOD,
    GROCERY,
    TRANSPORT,
    HOUSING,
    ENTERTAINMENT,
    TOURISM,
    SUBSCRIPTIONS,
    KITTENS,
    OTHER
};

class CategoryManager {
public:
    static std::string toString(Category category) {
        switch (category) {
            case Category::FOOD: return "Food";
            case Category::GROCERY: return "Grocery";
            case Category::TRANSPORT: return "Transport";
            case Category::HOUSING: return "Housing";
            case Category::ENTERTAINMENT: return "Entertainment";
            case Category::TOURISM: return "Tourism";
            case Category::SUBSCRIPTIONS: return "Subscriptions";
            case Category::KITTENS: return "Kittens";
            case Category::OTHER: return "Other";
        }
        throw std::invalid_argument("Invalid category");
    }

    static Category fromString(std::string_view str) {
        if (str == "Food" || str == "food") return Category::FOOD;
        if (str == "Grocery" || str == "grocery") return Category::GROCERY;
        if (str == "Transport" || str == "transport") return Category::TRANSPORT;
        if (str == "Housing" || str == "housing") return Category::HOUSING;
        if (str == "Entertainment" || str == "entertainment") return Category::ENTERTAINMENT;
        if (str == "Tourism" || str == "tourism") return Category::TOURISM;
        if (str == "Subscriptions" || str == "subscriptions") return Category::SUBSCRIPTIONS;
        if (str == "Kittens" || str == "kittens") return Category::KITTENS;
        if (str == "Other" || str == "other") return Category::OTHER;
        throw std::invalid_argument("Invalid category string");
    }

    static std::vector<Category> getAllCategories() {
        return {
            Category::FOOD,
            Category::GROCERY,
            Category::TRANSPORT,
            Category::HOUSING,
            Category::ENTERTAINMENT,
            Category::TOURISM,
            Category::SUBSCRIPTIONS,
            Category::KITTENS,
            Category::OTHER
        };
    }
};

} // namespace budget
