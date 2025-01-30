import { brotliDecompressSync } from "zlib";

/**
 * @typedef {Object} MyError
 * @property {string} code
 * @property {string} message
 * @property {string} [detail]
 * @property {string} [suggestion]
 * @property {MyError} [stack]
 */

/**
 * @typedef {null | undefined} Nullish
 */

/**
 @template T
 @typedef {
    {data: T, error: Nullish} |
    {data: Nullish, error: MyError}
 } AttemptResponse
 */

/**
 * @param {string} compressed_string
 * @returns {AttemptResponse<string>}
 */
function decompress(compressed_string) {
    try {
        const textDecoder = new TextDecoder();
        const compressed_buffer_from_string = compressed_string_to_buffer(compressed_string);
        const decompressedData = brotliDecompressSync(compressed_buffer_from_string);
        const decompressed_string = textDecoder.decode(decompressedData);
        return { data: decompressed_string, error: null };
    } catch (e) {
        return {
            data: null,
            error: {
                code: "invalid_data",
                message: `Could not decompress string`,
            },
        };
    }
}

/**
 * @param {string} str
 */
function compressed_string_to_buffer(str) {
    return new Uint8Array([...atob(str)].map((c) => c.charCodeAt(0)));
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ url }) {
    let default_trigger_definitions = `// Comments
prop/path/1 -> prop/path/3 /* inline comments */
prop/path/1 -> prop/path/2 : relationship`;

    let compressed = url.searchParams.get("r");

    if (!compressed) {
        return { 
            trigger_definitions: default_trigger_definitions 
        };
    }

    let { data: decompressed_data, error: decompression_error } = decompress(compressed);

    if (decompression_error){
        return {
            trigger_definitions: default_trigger_definitions, 
            error: {
                code: 'invalid_search',
                message: `Could not parse the URL into trigger definitions`,
                stack: decompression_error
            }
        };
    }

    return {
        trigger_definitions: decompressed_data,
    };
}
