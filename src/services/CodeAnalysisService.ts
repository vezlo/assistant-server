const Parser = require('tree-sitter');
const Python = require('tree-sitter-python');
const JavaScript = require('tree-sitter-javascript');
const TypeScript = require('tree-sitter-typescript');

interface FunctionInfo {
  name: string;
  params: string[];
  docstring?: string;
  startLine: number;
  endLine: number;
}

interface CodeAnalysisResult {
  functions: Map<string, FunctionInfo>;
  language: 'python' | 'javascript' | 'typescript' | 'unknown';
}

export class CodeAnalysisService {
  private parser: any;

  constructor() {
    this.parser = new Parser();
  }

  /**
   * Analyze code file and extract function metadata
   */
  analyzeCode(content: string, filename: string): CodeAnalysisResult {
    const language = this.detectLanguage(filename);
    
    if (language === 'unknown') {
      return { functions: new Map(), language: 'unknown' };
    }

    try {
      // Set parser language with validation
      if (language === 'python') {
        if (!Python || typeof Python !== 'object') {
          console.warn(`Python language binding not available for ${filename}`);
          return { functions: new Map(), language };
        }
        this.parser.setLanguage(Python);
      } else if (language === 'javascript') {
        if (!JavaScript || typeof JavaScript !== 'object') {
          console.warn(`JavaScript language binding not available for ${filename}`);
          return { functions: new Map(), language };
        }
        this.parser.setLanguage(JavaScript);
      } else if (language === 'typescript') {
        // tree-sitter-typescript has separate parsers for TS and TSX
        const ext = filename.toLowerCase().split('.').pop();
        if (ext === 'tsx') {
          if (!TypeScript || !TypeScript.tsx || typeof TypeScript.tsx !== 'object') {
            console.warn(`TypeScript TSX language binding not available for ${filename}`);
            return { functions: new Map(), language };
          }
          this.parser.setLanguage(TypeScript.tsx);
        } else {
          if (!TypeScript || !TypeScript.typescript || typeof TypeScript.typescript !== 'object') {
            console.warn(`TypeScript language binding not available for ${filename}`);
            return { functions: new Map(), language };
          }
          this.parser.setLanguage(TypeScript.typescript);
        }
      }

      const tree = this.parser.parse(content);
      if (!tree || !tree.rootNode) {
        console.warn(`Failed to parse ${filename}`);
        return { functions: new Map(), language };
      }

      const functions = new Map<string, FunctionInfo>();

      if (language === 'python') {
        this.extractPythonFunctions(tree.rootNode, content, functions);
      } else {
        this.extractJavaScriptFunctions(tree.rootNode, content, functions);
      }

      return { functions, language };
    } catch (error) {
      console.warn(`Could not analyze code for ${filename}, continuing without metadata`);
      return { functions: new Map(), language };
    }
  }

  /**
   * Generate metadata text for a function
   */
  generateFunctionMetadata(func: FunctionInfo): string {
    const parts: string[] = [];
    
    parts.push(`FUNCTION: ${func.name}`);
    
    if (func.params.length > 0) {
      parts.push(`PARAMETERS: ${func.params.join(', ')}`);
    }
    
    if (func.docstring) {
      parts.push(`PURPOSE: ${func.docstring}`);
    }
    
    return parts.join('\n') + '\n\n';
  }

  /**
   * Check if a chunk (by line range) contains any functions
   */
  getFunctionsInRange(functions: Map<string, FunctionInfo>, startLine: number, endLine: number): FunctionInfo[] {
    const result: FunctionInfo[] = [];
    
    for (const func of functions.values()) {
      // Check if function overlaps with chunk range
      if (func.startLine <= endLine && func.endLine >= startLine) {
        result.push(func);
      }
    }
    
    return result;
  }

  private detectLanguage(filename: string): 'python' | 'javascript' | 'typescript' | 'unknown' {
    const ext = filename.toLowerCase().split('.').pop();
    
    switch (ext) {
      case 'py':
        return 'python';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      default:
        return 'unknown';
    }
  }

  private extractPythonFunctions(node: any, content: string, functions: Map<string, FunctionInfo>) {
    if (node.type === 'function_definition') {
      const nameNode = node.childForFieldName('name');
      const paramsNode = node.childForFieldName('parameters');
      
      if (nameNode) {
        const funcName = content.substring(nameNode.startIndex, nameNode.endIndex);
        const params: string[] = [];
        
        // Extract parameters
        if (paramsNode) {
          this.extractPythonParams(paramsNode, content, params);
        }
        
        // Extract docstring
        const docstring = this.extractPythonDocstring(node, content);
        
        functions.set(funcName, {
          name: funcName,
          params,
          docstring,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1
        });
      }
    }
    
    // Recursively process children
    for (let i = 0; i < node.childCount; i++) {
      this.extractPythonFunctions(node.child(i)!, content, functions);
    }
  }

  private extractPythonParams(paramsNode: any, content: string, params: string[]) {
    for (let i = 0; i < paramsNode.childCount; i++) {
      const child = paramsNode.child(i);
      if (!child) continue;
      
      if (child.type === 'identifier') {
        const paramName = content.substring(child.startIndex, child.endIndex);
        if (paramName !== 'self' && paramName !== 'cls') {
          params.push(paramName);
        }
      } else if (child.type === 'typed_parameter' || child.type === 'default_parameter') {
        const nameNode = child.childForFieldName('name');
        const typeNode = child.childForFieldName('type');
        
        if (nameNode) {
          const paramName = content.substring(nameNode.startIndex, nameNode.endIndex);
          if (paramName !== 'self' && paramName !== 'cls') {
            if (typeNode) {
              const typeName = content.substring(typeNode.startIndex, typeNode.endIndex);
              params.push(`${paramName}: ${typeName}`);
            } else {
              params.push(paramName);
            }
          }
        }
      }
    }
  }

  private extractPythonDocstring(funcNode: any, content: string): string | undefined {
    const bodyNode = funcNode.childForFieldName('body');
    if (!bodyNode || bodyNode.childCount === 0) return undefined;
    
    const firstChild = bodyNode.child(0);
    if (firstChild && firstChild.type === 'expression_statement') {
      const stringNode = firstChild.child(0);
      if (stringNode && stringNode.type === 'string') {
        let docstring = content.substring(stringNode.startIndex, stringNode.endIndex);
        // Remove quotes and clean up
        docstring = docstring.replace(/^["']{1,3}|["']{1,3}$/g, '').trim();
        // Take first line only
        return docstring.split('\n')[0].substring(0, 100);
      }
    }
    
    return undefined;
  }

  private extractJavaScriptFunctions(node: any, content: string, functions: Map<string, FunctionInfo>) {
    if (node.type === 'function_declaration' || node.type === 'method_definition' || node.type === 'arrow_function') {
      const nameNode = node.childForFieldName('name');
      const paramsNode = node.childForFieldName('parameters');
      
      if (nameNode) {
        const funcName = content.substring(nameNode.startIndex, nameNode.endIndex);
        const params: string[] = [];
        
        // Extract parameters
        if (paramsNode) {
          this.extractJavaScriptParams(paramsNode, content, params);
        }
        
        functions.set(funcName, {
          name: funcName,
          params,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1
        });
      }
    }
    
    // Recursively process children
    for (let i = 0; i < node.childCount; i++) {
      this.extractJavaScriptFunctions(node.child(i)!, content, functions);
    }
  }

  private extractJavaScriptParams(paramsNode: any, content: string, params: string[]) {
    for (let i = 0; i < paramsNode.childCount; i++) {
      const child = paramsNode.child(i);
      if (!child) continue;
      
      if (child.type === 'identifier') {
        params.push(content.substring(child.startIndex, child.endIndex));
      } else if (child.type === 'required_parameter' || child.type === 'optional_parameter' || 
                 child.type === 'parameter') {
        // Try pattern field first (for destructured params)
        const nameNode = child.childForFieldName('pattern') || child.childForFieldName('name');
        if (nameNode) {
          const paramText = content.substring(nameNode.startIndex, nameNode.endIndex);
          // For TypeScript, include type annotation if present
          const typeNode = child.childForFieldName('type');
          if (typeNode) {
            const typeText = content.substring(typeNode.startIndex, typeNode.endIndex).trim();
            // Remove leading colon if present (tree-sitter sometimes includes it)
            const cleanType = typeText.replace(/^:\s*/, '');
            params.push(`${paramText}: ${cleanType}`);
          } else {
            params.push(paramText);
          }
        } else {
          // Fallback: try to get identifier directly
          const identifier = child.childForFieldName('identifier') || 
                            (child.childCount > 0 ? child.child(0) : null);
          if (identifier && identifier.type === 'identifier') {
            params.push(content.substring(identifier.startIndex, identifier.endIndex));
          }
        }
      }
    }
  }
}

