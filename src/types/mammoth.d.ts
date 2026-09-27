declare module 'mammoth' {
  export interface MammothResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
    }>;
  }

  export interface ConvertOptions {
    arrayBuffer?: ArrayBuffer;
    buffer?: Buffer;
    path?: string;
    styleMap?: string | string[];
    includeDefaultStyleMap?: boolean;
    ignoreEmptyParagraphs?: boolean;
  }

  export function extractRawText(input: { arrayBuffer?: ArrayBuffer; buffer?: Buffer; path?: string }): Promise<MammothResult>;
  export function convertToHtml(input: { arrayBuffer?: ArrayBuffer; buffer?: Buffer; path?: string }, options?: ConvertOptions): Promise<MammothResult>;
  export function convertToMarkdown(input: { arrayBuffer?: ArrayBuffer; buffer?: Buffer; path?: string }, options?: ConvertOptions): Promise<MammothResult>;
}
