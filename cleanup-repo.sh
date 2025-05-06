#!/bin/bash

echo "Starting repository cleanup..."

# 1. Remove unused UI component files
# These are UI components that are imported in the codebase but not actually used
echo "Removing unused UI component files..."
rm -f src/components/ui/toaster.tsx
rm -f src/components/ui/date-picker-with-range.tsx
rm -f src/components/ui/form.tsx

# 2. Clean up App.tsx file
echo "Cleaning up App.tsx file..."
# Backup original file
cp src/App.tsx src/App.tsx.bak

# Remove unnecessary imports
sed -i '' -e 's/import { useRoutes, Routes, Route } from "react-router-dom";/import { Routes, Route } from "react-router-dom";/' src/App.tsx
sed -i '' -e 's/import { mainnet, polygon, optimism, arbitrum, base, gnosis } from '"'"'wagmi\/chains'"'"';/import { mainnet } from '"'"'wagmi\/chains'"'"';/' src/App.tsx
sed -i '' -e '/import routes from "tempo-routes";/d' src/App.tsx

# Remove unused variable
sed -i '' -e 's/const chains = \[mainnet, polygon, optimism, arbitrum, base, gnosis\] as const;/const chains = [mainnet] as const;/' src/App.tsx

# Remove commented out code
sed -i '' -e '/{\* {import.meta.env.VITE_TEMPO === "true" && useRoutes(routes)} \*}/d' src/App.tsx

# 3. Cleanup stories folder
echo "Removing unused stories files..."
# UI components that are actually used
USED_COMPONENTS=("alert" "badge" "button" "card" "dialog" "input" "label" "progress" "separator")

# Find all story files
STORY_FILES=$(find ./src/stories -name "*.stories.tsx")

# Loop through each file and check if it's used
for file in $STORY_FILES; do
  filename=$(basename "$file" .stories.tsx)
  keep=false

  for comp in "${USED_COMPONENTS[@]}"; do
    if [ "$comp" = "$filename" ]; then
      keep=true
      break
    fi
  done

  if [ "$keep" = false ]; then
    echo "Removing unused story file: $file"
    rm -f "$file"
  fi
done

# 4. Update package.json to remove unused dependencies
echo "Updating package.json to remove unused dependencies..."
# Backup original file
cp package.json package.json.bak

# Create a list of Radix UI components to keep
KEEP_RADIX=("react-alert" "react-badge" "react-button" "react-card" "react-dialog" "react-icons" "react-input" "react-label" "react-progress" "react-separator" "react-slot")

# Create a temporary file
cat package.json | jq '
  .dependencies = (.dependencies | with_entries(
    select(
      (.key | startswith("@radix-ui/")) |
      not or
      (
        .key | split("/")[1] | inside([
          "react-alert", "react-badge", "react-button", "react-card", 
          "react-dialog", "react-icons", "react-input", "react-label", 
          "react-progress", "react-separator", "react-slot"
        ])
      )
    )
  )) |
  .devDependencies = (.devDependencies | with_entries(
    select(.key != "tempo-devtools")
  ))
' > package.json.new

# Check if jq command succeeded
if [ $? -eq 0 ]; then
  mv package.json.new package.json
  echo "Successfully updated package.json"
else
  echo "Error updating package.json with jq. Manual update required."
  rm -f package.json.new
fi

echo "Cleanup complete. Backup files with .bak extension were created."
echo "Please review the changes and run 'npm install' to update dependencies." 