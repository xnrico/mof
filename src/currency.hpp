#pragma once

#include <string>
#include <string_view>
#include <stdexcept>

namespace budget {

enum class Currency {
    GBP,
    USD
};

class CurrencyConverter {
public:
    static std::string toString(Currency currency) {
        switch (currency) {
            case Currency::GBP: return "GBP";
            case Currency::USD: return "USD";
        }
        throw std::invalid_argument("Invalid currency");
    }

    static Currency fromString(std::string_view str) {
        if (str == "GBP" || str == "gbp") return Currency::GBP;
        if (str == "USD" || str == "usd") return Currency::USD;
        throw std::invalid_argument("Invalid currency string");
    }

    static std::string getSymbol(Currency currency) {
        switch (currency) {
            case Currency::GBP: return "£";
            case Currency::USD: return "$";
        }
        throw std::invalid_argument("Invalid currency");
    }
};

} // namespace budget
