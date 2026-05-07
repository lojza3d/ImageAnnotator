const path = require('path');

// Test paths with spaces
const testPaths = [
  '/Users/lojza/Downloads/LoRA Training Set',
  '"/Users/lojza/Downloads/LoRA Training Set"',
  "'/Users/lojza/Downloads/LoRA Training Set'",
];

function cleanPath(dirPath) {
  if (!dirPath) return '';
  
  // Remove surrounding quotes (both single and double)
  let cleaned = dirPath.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  
  return cleaned;
}

testPaths.forEach((testPath, index) => {
  console.log(`\nTest ${index + 1}:`);
  console.log('Input:', testPath);
  
  const cleaned = cleanPath(testPath);
  console.log('Cleaned:', cleaned);
  
  const resolved = path.resolve(cleaned);
  console.log('Resolved:', resolved);
});
