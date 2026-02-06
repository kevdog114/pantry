/**
 * Script to refactor GeminiController.ts to use shared gemini module
 * This script performs targeted replacements for:
 * 1. Import statement
 * 2. Post handler: toolDisplayNames, inventoryTools, handleToolCall
 * 3. Stream handler: streamTools, toolDisplayNames, handleStreamToolCall
 */

import * as fs from 'fs';
import * as path from 'path';

const CONTROLLER_PATH = path.join(__dirname, '../src/controllers/GeminiController.ts');

// Read the file
let content = fs.readFileSync(CONTROLLER_PATH, 'utf-8');
const lines = content.split('\n');
console.log(`Original file has ${lines.length} lines`);

// Step 1: Add import for shared gemini module
const importLine = `import { sendNotificationToUser } from "./PushController";`;
const newImport = `import { sendNotificationToUser } from "./PushController";
import { 
  toolDisplayNames as sharedToolDisplayNames, 
  getAllToolDefinitions, 
  executeToolHandler, 
  ToolContext 
} from "../gemini";`;
content = content.replace(importLine, newImport);

// Step 2: Replace post handler toolDisplayNames 
const postToolDisplayNamesRegex = /    \/\/ Tool display names for friendly UI messages\n    const toolDisplayNames: Record<string, string> = \{[\s\S]*?\n    \};/;
content = content.replace(postToolDisplayNamesRegex,
  `    // Tool display names from shared module
    const toolDisplayNames = sharedToolDisplayNames;`);

// Step 3: Replace post handler inventoryTools and handleToolCall
// Find the start of inventoryTools
const inventoryToolsStart = content.indexOf('    const inventoryTools = [');
if (inventoryToolsStart === -1) {
  console.error('Could not find inventoryTools start');
  process.exit(1);
}

// Find the end of handleToolCall - it ends just before "const debugSetting"
const handleToolCallEndMarker = `        return { error: e.message };
      }
    }

    const debugSetting`;
const handleToolCallEnd = content.indexOf(handleToolCallEndMarker);
if (handleToolCallEnd === -1) {
  console.error('Could not find handleToolCall end');
  process.exit(1);
}

const endOfHandleToolCall = handleToolCallEnd + handleToolCallEndMarker.indexOf('\n\n    const debugSetting');
const endOfHandleToolCall2 = content.indexOf('\n\n    const debugSetting', handleToolCallEnd);

const postReplacement = `    // Tool definitions from shared module
    const inventoryTools = getAllToolDefinitions();

    // Tool handler using shared module
    const toolContext: ToolContext = {
      userId: (req as any).userId || (req.user as any)?.id,
      io: req.app.get("io")
    };
    
    async function handleToolCall(name: string, args: any): Promise<any> {
      return executeToolHandler(name, args, toolContext);
    }`;

const oldPostBlock = content.substring(inventoryToolsStart, endOfHandleToolCall2);
console.log(`Found post handler block: ${oldPostBlock.split('\n').length} lines`);
content = content.substring(0, inventoryToolsStart) + postReplacement + content.substring(endOfHandleToolCall2);

// Step 4: Replace streaming handler
// Find streamTools definition
const streamToolsRegex = /    \/\/ Define tools for streaming \(subset of full tools - read-only context tools\)\n    \/\/ Moved up for auto-routing\n    const streamTools = \[\n      \{\n        functionDeclarations: \[[\s\S]*?\n        \]\n      \}\n    \];/;
content = content.replace(streamToolsRegex,
  `    // Define tools for streaming - use all tools from shared module
    const streamTools = getAllToolDefinitions();`);

// Step 5: Replace streaming toolDisplayNames
const streamToolDisplayNamesRegex = /    \/\/ Tool display names for friendly UI messages \(same as in post handler\)\n    const toolDisplayNames: Record<string, string> = \{[\s\S]*?deleteTimer: "Stopping timer\.\.\."\n    \};/;
content = content.replace(streamToolDisplayNamesRegex,
  `    // Tool display names from shared module
    const toolDisplayNames = sharedToolDisplayNames;`);

// Step 6: Replace streaming handleStreamToolCall
const streamHandlerStart = content.indexOf('    // Import the tool definitions and handler (reuse from post handler structure)');
if (streamHandlerStart === -1) {
  console.log('Could not find handleStreamToolCall start comment');
} else {
  // Find the end of handleStreamToolCall - ends with the closing brace before the comment about defining tools for streaming
  const streamHandlerEndMarker = `      } catch (e: any) {
        return { error: e.message };
      }
    };

    // Define tools for streaming (subset of full tools - read-only context tools)`;
  const streamHandlerEnd = content.indexOf(streamHandlerEndMarker, streamHandlerStart);

  if (streamHandlerEnd === -1) {
    console.log('Could not find handleStreamToolCall end marker');
  } else {
    const endOfStreamHandler = streamHandlerEnd + streamHandlerEndMarker.indexOf('\n\n    // Define tools for streaming');
    const endOfStreamHandler2 = content.indexOf('\n\n    // Define tools for streaming (subset', streamHandlerEnd);

    const streamReplacement = `    // Streaming tool handler - delegates to shared handler
    const streamToolContext: ToolContext = {
      userId: (req as any).userId || (req.user as any)?.id,
      io: req.app.get("io")
    };
    
    const handleStreamToolCall = async (name: string, args: any): Promise<any> => {
      return executeToolHandler(name, args, streamToolContext);
    };`;

    const oldStreamBlock = content.substring(streamHandlerStart, endOfStreamHandler2);
    console.log(`Found stream handler block: ${oldStreamBlock.split('\n').length} lines`);
    content = content.substring(0, streamHandlerStart) + streamReplacement + content.substring(endOfStreamHandler2);
  }
}

// Write the result
fs.writeFileSync(CONTROLLER_PATH, content);

const newLines = content.split('\n');
console.log(`New file has ${newLines.length} lines`);
console.log(`Removed ${lines.length - newLines.length} lines`);
