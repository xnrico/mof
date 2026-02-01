# MoF - Ministry of Finance Budget Tracker

Daixu's Ministry of Finance helps Daixu's family keep track of their budgets.

A simple yet powerful command-line budget tracker application built with C++23 modules.

## Features

- ✅ Add, modify, and delete budget entries
- 💰 Multiple currency support (GBP £, USD $)
- 📊 Budget categorization (Food, Transport, Housing, Entertainment, Utilities, Healthcare, Education, Savings, Other)
- 💾 Save and load budget data from files
- 📈 Category-wise summary and reporting
- 🔍 Filter entries by category
- 🎯 Clean command-line interface

## Requirements

- CMake 3.28 or higher
- C++23 compatible compiler (Clang 16+, GCC 14+, or MSVC 19.30+)
- macOS, Linux, or Windows

## Building the Project

### On macOS/Linux

```bash
# Clone the repository
git clone https://github.com/xnrico/mof.git
cd mof

# Create build directory
mkdir -p build
cd build

# Configure and build
cmake ..
cmake --build .
```

### Building with Clang on macOS

```bash
# Use Clang with C++23 module support
export CXX=clang++
export CC=clang
mkdir -p build && cd build
cmake .. -DCMAKE_CXX_COMPILER=clang++
cmake --build .
```

## Running the Application

After building, run the application:

```bash
# From the build directory
./bin/mof

# Or from the project root
./build/bin/mof
```

## Usage

The application provides an interactive menu with the following options:

1. **Add Budget Entry** - Create a new budget entry with description, amount, category, and currency
2. **Modify Budget Entry** - Update an existing entry by ID
3. **Delete Budget Entry** - Remove an entry by ID
4. **View All Entries** - Display all budget entries
5. **View Entries by Category** - Filter and view entries for a specific category
6. **View Category Summary** - See total spending by category for a selected currency
7. **Load Budget from File** - Import budget data from a CSV file
8. **Save Budget to File** - Export budget data to a CSV file
9. **Exit** - Close the application

### Example Workflow

```
1. Add entries for your daily expenses
2. Categorize them (Food, Transport, etc.)
3. Choose currency (GBP or USD)
4. View summaries to track spending
5. Save your budget to data/budget.csv
6. Load it later to continue tracking
```

## Project Structure

```
mof/
├── CMakeLists.txt          # Main CMake configuration
├── README.md               # This file
├── src/                    # Source code
│   ├── CMakeLists.txt      # Source CMake configuration
│   ├── main.cpp            # Main application entry point
│   ├── currency.cppm       # Currency module (GBP/USD)
│   ├── category.cppm       # Category module
│   ├── entry.cppm          # Budget entry module
│   ├── manager.cppm        # Budget manager module
│   └── fileio.cppm         # File I/O module
├── test/                   # Test files
│   ├── CMakeLists.txt      # Test CMake configuration
│   └── test_budget.cpp     # Unit tests
├── build/                  # Build output (generated)
└── data/                   # Budget data files
    └── .gitkeep
```

## Running Tests

```bash
# From the build directory
ctest --output-on-failure

# Or run the test executable directly
./bin/test_budget
```

## File Format

Budget data is stored in CSV format with the following structure:

```csv
ID,Description,Amount,Category,Currency,Timestamp
ENTRY1,Groceries,50.00,Food,GBP,2024-02-01 10:30:00
ENTRY2,Bus ticket,2.50,Transport,GBP,2024-02-01 11:00:00
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

See [LICENSE](LICENSE) file for details.

## Author

Built for Daixu's family budget management 💰
