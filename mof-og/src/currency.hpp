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

    static double convert(double amount, const double exchangeRate, Currency from, Currency to) {
        if (from == to) {
            return amount;
        }
        // Example conversion rates
        const double GBP_TO_USD = exchangeRate;
        const double USD_TO_GBP = 1.0 / GBP_TO_USD;

        if (from == Currency::GBP && to == Currency::USD) {
            return amount * GBP_TO_USD;
        } else if (from == Currency::USD && to == Currency::GBP) {
            return amount * USD_TO_GBP;
        } else {
            return amount; // same currency, no conversion needed
        }

        throw std::invalid_argument("Invalid currency conversion");
    }
};

} // namespace budget
