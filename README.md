# Notion PLR Inspector

## 1. Overview

The Notion PLR Inspector is a command-line toolkit designed for developers and power users who work with Notion templates, particularly Private Label Rights (PLR) content. It provides a streamlined workflow to inspect and analyze Notion pages and databases.

This toolkit allows you to:

- **Deeply analyze** the structure of a Notion template.
- **Extract detailed information** about databases, properties, and content blocks.
- **Generate summaries and quality reports** to quickly understand a template's complexity.

## 2. Project Structure

```
.env.example
.editorconfig
.gitignore
.prettierrc.json
get-latest-scan-dir.js
index.js
package.json
run.sh
```

### 2.1. Core Files

- **`index.js`**: The main script for inspecting a Notion page. It recursively scans the page, extracts its structure and content, and saves the data to a JSON file.
- **`get-latest-scan-dir.js`**: A helper script that identifies the most recent scan directory in the `scans` folder.

### 2.2. Configuration Files

- **`.env.example`**: An example file showing the required environment variables. You should create a `.env` file with your `NOTION_TOKEN` and the `PAGE_ID` of the Notion page you want to inspect.
- **`package.json`**: Defines the project's metadata, dependencies, and scripts.
- **`.editorconfig` & `.prettierrc.json`**: Configuration files to ensure consistent code formatting.

## 3. Key Functions and Logic

### `index.js` - The Inspector

This script is the heart of the inspection process. It uses the Notion API to perform a deep dive into a specified Notion page.

- **`inspectDatabase(dbId, indent)`**: Retrieves and analyzes a Notion database, including its properties (relations, formulas, rollups) and a sample of its rows.
- **`inspectBlock(blockId, indent, parentType)`**: Recursively fetches and processes all blocks on a page, identifying their type and content. It handles nested blocks and child databases.
- **`extractText(property)`**: A utility function to extract the plain text content from various Notion property types.
- **`generateSummaries()`**: Creates a high-level summary of the page, including the total number of blocks and databases, the first paragraph of text, and a list of top-level headings.
- **`generateRelationshipSummary()`**: Analyzes the relationships between databases and provides a human-readable summary of how they are linked.
- **`determineTemplateType()`**: A simple function that attempts to identify the type of template based on the presence of specific databases and relationships (e.g., a "goal-tracker").
- **`generateQualityReport()`**: Generates a report on the quality of the databases in the template, checking for the presence of titles, relations, formulas, and rollups.

## 4. Getting Started

### 4.1. Prerequisites

- Node.js (v14 or later)
- A Notion API key

### 4.2. Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/notion-plr-inspector.git
    cd notion-plr-inspector
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure your environment:**
    Create a `.env` file in the project root and add your Notion API key and the ID of the page you want to inspect:
    ```
    NOTION_TOKEN=your_notion_token_here
    PAGE_ID=your_page_id_here
    ```

## 5. Usage

### 5.1. Scanning a Notion Page

To inspect a Notion page and generate a `notion_plr_extracted.json` file, run:

```bash
npm run scan
```

This will create a new directory in the `scans` folder containing the inspection results.

## 6. Customization

The true power of this toolkit lies in its customizability. You can build on the inspection data to perform a wide range of modifications, such as:

-   Changing rollup formulas
-   Overwriting specific database fields
-   Injecting checklists or instructions
-   Replacing page titles or emoji icons

By building on the provided examples, you can create powerful and reusable transformations for all your Notion PLR projects.

## 7. License

This project is licensed under the MIT License.
