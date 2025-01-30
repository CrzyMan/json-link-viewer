import { brotliDecompressSync } from "zlib";

/**
 * @param {string} compressed_string
 */
function decompress(compressed_string) {
    const textDecoder = new TextDecoder();
    const compressed_buffer_from_string = compressed_string_to_buffer(compressed_string);
    const decompressedData = brotliDecompressSync(compressed_buffer_from_string);
    const decompressed_string = textDecoder.decode(decompressedData);
    return decompressed_string;
}

/**
 * @param {string} str
 */
function compressed_string_to_buffer(str) {
    return new Uint8Array([...atob(str)].map((c) => c.charCodeAt(0)));
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ url }) {
    let trigger_definitions = `// Comments
prop/path/1 -> prop/path/3 /* inline comments */
prop/path/1 -> prop/path/2 : relationship`;

    let compressed = url.searchParams.get("r");
    if (compressed) {
        trigger_definitions = decompress(compressed);
    }
    return {
        trigger_definitions,
    };
}
