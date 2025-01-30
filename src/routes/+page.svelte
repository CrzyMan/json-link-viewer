<script>
	import { browser } from "$app/environment";
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
	import { SlideToggle } from "@skeletonlabs/skeleton";
    import { tick } from 'svelte';
    import { linear } from 'svelte/easing';
    import { Tween } from 'svelte/motion';
	import { SvelteSet } from "svelte/reactivity";
    import { fade, fly, slide } from 'svelte/transition';

	/** @type {{data: import('./$types').PageData}} */
	let { data } = $props();
	// console.log({ data });

    /** @type {{compress: (data: Uint8Array) => Uint8Array, decompress: (buffer: Uint8Array) => Uint8Array}} */
	let brotli;

	if (browser) {
		// @ts-ignore
		import("https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module")
			.then((m) => m.default)
			.then((b) => (brotli = b));
	}

	let trigger_definitions = $state(
		data.trigger_definitions ??
			`// Comments
prop/path/1 -> prop/path/3 /* inline comments */
prop/path/1 -> prop/path/2 : relationship`,
	);

    let updating_url_ourselves = false;

    let autosave_changes = $state(true);
    let unsaved_changes = $state(false);
    let autosave_pause_remaining = new Tween(0, {easing: linear});
    const MS_TO_WAIT_BEFORE_AUTOSAVE = 5_000;
	const debounced_triggers_to_url = debounced(
        /**
         * @param {string} tr
         */
        (tr) => {
            if (!autosave_changes){
                return;
            }
            save_progress_to_url(tr);
            
        },
        MS_TO_WAIT_BEFORE_AUTOSAVE
    );

    /**
     * @param {string} tr
     */
    async function save_progress_to_url(tr){
        updating_url_ourselves = true;
        add_triggers_to_url(tr);
        unsaved_changes = false;

        // Let page effect trigger while it shouldn't care
        await pause_for(100); 
        updating_url_ourselves = false;
    }

    /**
     * @param {number} [duration_ms=0]
     * @returns {Promise<void>}
     */
    function pause_for(duration_ms = 0){
        return new Promise(res => {
            setTimeout(res, duration_ms);
        });
    }

    // Update the triggers when the URL changes on us (not when we do it)
    $effect(() => {
        page.url.search;
        if (updating_url_ourselves) {
            return;
        }
        use_triggers_from_url();
    })

	/**
	 * @param {string} str
	 * @returns {string}
	 */
	function encode_string(str) {
		if (!brotli) return "";
		const textEncoder = new TextEncoder();
		const uncompressedData = textEncoder.encode(str);
        // @ts-ignore
		const compressedBuffer = brotli.compress(uncompressedData);
		const compressed_string = compressed_buffer_to_string(compressedBuffer);
		return compressed_string;
	}

	/**
	 * @param {string} compressed_string
	 * @returns {string}
	 */
	function decode_string(compressed_string) {
		console.log("decoding");
		if (!brotli) return "";
		const textDecoder = new TextDecoder();
		const compressed_buffer_from_string = compressed_string_to_buffer(compressed_string);
        // @ts-ignore
		const decompressedData = brotli.decompress(compressed_buffer_from_string);
		const decompressed_string = textDecoder.decode(decompressedData);
		return decompressed_string;
	}

	/**
	 * @param {*} buff
	 */
	function compressed_buffer_to_string(buff) {
		return btoa(String.fromCharCode.apply(null, buff));
	}

	/**
	 * @param {string} str
	 */
	function compressed_string_to_buffer(str) {
		return new Uint8Array([...atob(str)].map((c) => c.charCodeAt(0)));
	}

	function use_triggers_from_url() {
		if (!brotli) {
			return;
		}
		let u = new URL(window.location.href);
		let compressed = u.searchParams.get("r");
		if (!compressed) {
			return;
		}
		let decompressed = decode_string(compressed);
		trigger_definitions = decompressed;
	}

	/**
	 * @param {string} triggers
	 */
	function add_triggers_to_url(triggers) {
		if (!brotli) {
			return;
		}
		let compressed = encode_string(triggers);
		let u = new URL(window.location.href);
		u.searchParams.set("r", compressed);
		// window.history.pushState({}, "", u.href);
		goto(u.href, {keepFocus: true, replaceState: false})
		return compressed;
	}

	/**
	 @typedef {string} SchemaPath e.g. 'path/to/{dynamic}/resource'
	 @typedef {`${SchemaPath} -> ${SchemaPath} : ${string}`} TriggerDefinition e.g. 'source -> effect : relationship'
 	*/
	/**
	 @typedef {{path: SchemaPath, relationship: string}} TriggerEffect
	 @typedef {{key: string, path: SchemaPath, effects: TriggerEffect[], sources: TriggerEffect[], children: TreeNode[]}} TreeNode
	*/

	/**
	 * Build tree from triggers separated by new lines
	 * @param {string} triggers
	 * @returns {TreeNode}
	 */
	function build_tree(triggers) {
		try {
			/** @type {TreeNode} */
			let root = {
				key: "root",
				path: "root",
				children: [],
				effects: [],
				sources: [],
			};

			let trigger_defs = markdown_to_path_defs(triggers);
			// console.log(trigger_defs);

			// Compose the full object
			for (let trigger_def of trigger_defs) {
				let [source_path, effect_path, relationship] = trigger_def.split(/ ?-> ?| ?: ?/g);
				let source_props = source_path.split("/").filter((p) => p);
				let effect_props = effect_path.split("/").filter((p) => p);

				let ref_node = root;
				for (let next_key of source_props) {
					let child_node = ref_node.children.find((c) => c.key === next_key);
					if (!child_node) {
						child_node = {
							key: next_key,
							path: `${ref_node.path}/${next_key}`,
							children: [],
							effects: [],
							sources: [],
						};
						ref_node.children.push(child_node);
						/** @ts-ignore */
						ref_node.children.sort((a, b) => a.key.localeCompare(b.key, {}, { ignorePunctuation: true, caseFirst: false }));
					}

					if (next_key === source_props.at(-1)) {
						child_node.effects.push({
							path: `root/${effect_path}`,
							relationship,
						});
					}

					ref_node = child_node;
				}
				ref_node = root;
				for (let next_key of effect_props) {
					let child_node = ref_node.children.find((c) => c.key === next_key);
					if (!child_node) {
						child_node = {
							key: next_key,
							path: `${ref_node.path}/${next_key}`,
							children: [],
							effects: [],
							sources: [],
						};
						ref_node.children.push(child_node);
						ref_node.children.sort((a, b) => a.key.localeCompare(b.key, undefined, { ignorePunctuation: true, caseFirst: "false" }));
					}

					if (next_key === effect_props.at(-1)) {
						child_node.sources.push({
							path: `root/${source_path}`,
							relationship,
						});
					}

					ref_node = child_node;
				}
			}
			most_recent_valid_tree = root;
			return root;
		} catch (e) {
			return most_recent_valid_tree;
		}
	}

	/** @type {TreeNode} */
	let most_recent_valid_tree;
	let tree = $derived(build_tree(trigger_definitions));

	/** @type {SvelteSet<string>} */
	let effect_paths_to_highlight = new SvelteSet();

	/** @type {SvelteSet<string>} */
	let source_paths_to_highlight = new SvelteSet();

	/** @type {SvelteSet<string>} */
	let hover_paths = new SvelteSet();

	// let trigger_def_array = $state([]);

	/**
	 @typedef {{
		source_path: string;
		effect_path: string;
		relationship: string;
		text_pos: {x: number, y: number}
		arrow_path: string;
	 }} Arrow
	*/

	/** @type {Arrow[]} */
	let arrows = $state([]);

	$effect(() => {
		arrows = generate_arrow_paths(trigger_definitions);
	});

	/**
	 * @param {string} trigger_definitions
	 * @returns {Arrow[]}
	 */
	function generate_arrow_paths(trigger_definitions) {
		// if (typeof document === 'undefined'){
		// 	return [];
		// }

		/** @type {Arrow[]} */
		let result = [];

		let existing_paths = document.querySelectorAll("[data-remove-me]");
		existing_paths.forEach((s) => s.remove());
		let trigger_def_array = markdown_to_path_defs(trigger_definitions);

		let on_page_svg = document.querySelector("svg");

		let svg_rect = on_page_svg?.getBoundingClientRect();
		if (!svg_rect) {
			return [];
		}

		on_page_svg?.setAttribute("viewBox", `0 0 ${svg_rect.width} ${svg_rect.height}`);

		for (let trigger_def of trigger_def_array) {
			let [source_path, effect_path, relationship] = trigger_def.split(/ ?-> ?| ?: ?/g);
			let source_rect = document.querySelector(`[data-path="root/${source_path}"] .key`)?.getBoundingClientRect();
			let effect_rect = document.querySelector(`[data-path="root/${effect_path}"] .key`)?.getBoundingClientRect();

			if (!source_rect || !effect_rect) break;

			let jutting = 25 + Math.abs(source_rect.y - effect_rect.y) * 0.5;
			let arrow_width = 5;
			let horizontal_gap = 5;
			let vertical_offset = 7;

			let arrow_path = `
				M${source_rect.x - svg_rect.x + source_rect.width + horizontal_gap},${source_rect.y - svg_rect.y + source_rect.height - vertical_offset}
				C${source_rect.x - svg_rect.x + source_rect.width + horizontal_gap + jutting},${source_rect.y - svg_rect.y + source_rect.height - vertical_offset}
				${effect_rect.x - svg_rect.x + effect_rect.width + horizontal_gap + jutting},${effect_rect.y - svg_rect.y + vertical_offset}
				${effect_rect.x - svg_rect.x + effect_rect.width + horizontal_gap + arrow_width},${effect_rect.y - svg_rect.y + vertical_offset}
				l ${-arrow_width},${0}
			`;

			let text_horizontal_offset = 25;
			let text_vertical_offset = -6;
			let text_pos = {
				x: effect_rect.x - svg_rect.x + effect_rect.width + text_horizontal_offset,
				y: effect_rect.y - svg_rect.y + text_vertical_offset,
			};

			/** @type {Arrow} */
			let arrow = {
				source_path,
				effect_path,
				relationship,
				arrow_path,
				text_pos,
			};
			result.push(arrow);
		}
		return result;
	}

	/**
     * @template {(...args: any) => any} T
	 * @param {T} callback
	 * @param {number} [timeout_ms=100]
	 */
	function debounced(callback, timeout_ms = 100) {
		/** @type {any} */
		let timeout_id;

		/**
		 * @param {Parameters<T>} args
		 */
		const result = (...args) => {
			clearTimeout(timeout_id);
			timeout_id = setTimeout(() => {
				callback(...args)
			}, timeout_ms);
		};
		return result;
	}

	function regenerate_svg() {
		arrows = generate_arrow_paths(trigger_definitions);
	}

	/**
	 * @param {string} str
	 */
	function clsx(str) {
		return str.trim().replaceAll(/[\n\s]+/g, " ");
	}

	/**
	 * @param {string} str
	 */
	function sanitizeHTML(str) {
		return str.replace(/[^\w. ]/gi, function (c) {
			return "&#" + c.charCodeAt(0) + ";";
		});
	}

	/**
	 * @param {string} triggers
	 * @returns {TriggerDefinition[]}
	 */
	function markdown_to_path_defs(triggers) {
		return /** @type {TriggerDefinition[]} */ (
			triggers
				.replaceAll(/\/\*(.|\n)*?\*\//g, "")
				.replaceAll(/\/\/.*?(\n|^)/g, "\n")
				.replaceAll(/ +/g, " ")
				.split(/(\n\s*)+/)
				.map((t) => t.trim())
				.filter((t) => t)
		);
	}

	let show_text_always_toggle = $state(false);
	/** @type {"always" | "hover"} */
	let relationship_text_display = $derived(show_text_always_toggle ? "always" : "hover");

</script>

<svelte:window 
    onresize={debounced(regenerate_svg)} 
/>

{#snippet tree_display(/** @type {TreeNode} */ n, depth = 0)}
	{@const root_node = /** @type {TreeNode} */ (n)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		data-path={root_node.path}
		class={clsx(`
			relative z-10
			border-l border-solid
			pointer-events-none
			pl-[10px]
			tree-node
		`)}
		style:--hue={`${depth * 60}`}
		style:--level={depth}
		style:border-color={`lch(70% 100 var(--hue))`}
		style:--override-bg={effect_paths_to_highlight.has(root_node.path) ? "var(--highlight-yellow)" : ""}
	>
		<div
			class="key w-max flex items-center pointer-events-auto"
			style:background-color="var(--override-bg, {source_paths_to_highlight.has(root_node.path) ? 'var(--highlight-yellow)' : (
				'hsl(0 0% 100% / 80%)'
			)}"
			style:z-index="calc(100 - var(--level))"
			onmouseenter={() => {
				hover_paths.add(root_node.path);
				// console.log("hover paths: ", [...hover_paths]);

				if (root_node.effects.length > 0) {
					// console.log(`ADDING SOURCE ${root_node.path}`);
					source_paths_to_highlight.add(root_node.path);
					for (let effect of root_node.effects) {
						// console.log(`> ADDING EFFECT ${effect.path}`);
						effect_paths_to_highlight.add(effect.path);
					}
				}

				if (root_node.sources.length > 0) {
					// console.log(`ADDING EFFECT ${root_node.path}`);
					effect_paths_to_highlight.add(root_node.path);
					for (let source of root_node.sources) {
						// console.log(`> ADDING SOURCE ${source.path}`);
						source_paths_to_highlight.add(source.path);
					}
				}
			}}
			onmouseleave={() => {
				hover_paths.delete(root_node.path);
				// console.log("hover paths: ", [...hover_paths]);

				if (root_node.effects.length > 0) {
					// console.log(`DELETING SOURCE ${root_node.path}`);
					source_paths_to_highlight.delete(root_node.path);
					for (let effect of root_node.effects) {
						// console.log(`> DELETING EFFECT ${effect.path}`);
						effect_paths_to_highlight.delete(effect.path);
					}
				}

				if (root_node.sources.length > 0) {
					// console.log(`DELETING EFFECT ${root_node.path}`);
					effect_paths_to_highlight.delete(root_node.path);
					for (let source of root_node.sources) {
						// console.log(`> DELETING SOURCE ${source.path}`);
						source_paths_to_highlight.delete(source.path);
					}
				}
			}}
		>
			{#if root_node.children?.length === 0}
				{@html `${sanitizeHTML(root_node.key)}: {...}`}
			{:else}
				{root_node.key}/
			{/if}
		</div>
		<div class="pl-4 pointer-events-none">
			{#each root_node.children ?? [] as child_node}
				{@render tree_display(child_node, depth + 1)}
			{/each}
		</div>
	</div>
{/snippet}

<div class="p-6 space-y-5">
    <div class="space-x-4">
        <button 
            class="btn btn-sm variant-filled min-w-[30ch] transition-all relative rounded overflow-hidden"
            disabled={!unsaved_changes}
            onclick={() => save_progress_to_url(trigger_definitions)}
        >
            {#if unsaved_changes}
                {#if autosave_changes}
                    Autosaving In A Bit
                    <div 
                    style:width={`${autosave_pause_remaining.current}%`}
                    class="absolute left-0 bottom-0 border-b-4 border-white opacity-50 right-0"
                ></div>
                {:else}
                    Save Changes
                {/if}
            {:else}
                No Changes To Save
            {/if}
            
        </button>
        <div class="inline">
    		<span class="font-bold">Autosave as you type:</span>
    		<input type="checkbox" name="autosave" id="autosave" bind:checked={autosave_changes}>
            <span class="text-gray-600 ml-2 text-sm">Data is saved to the URL. No cookies, localdata, or transmissions. I don't want your data.</span>
        </div>
	</div>

	<textarea
		class="w-full h-[13rem] rounded font-mono"
		bind:value={trigger_definitions}
        oninput={async () => {
            unsaved_changes = true;
            await autosave_pause_remaining.set(100, {duration: 0});
            autosave_pause_remaining.set(0, {duration: MS_TO_WAIT_BEFORE_AUTOSAVE});
            debounced_triggers_to_url(trigger_definitions);
        }}
	></textarea>

	<div>
		<span class="font-bold">Display relationship Text: </span>
		<label class="inline-flex items-center gap-2">
			<span>On Hover</span>
			<SlideToggle
				name="show_text_on_hover_or_always"
				bind:checked={show_text_always_toggle}
				size="sm"
			/>
			<span>Always</span>
		</label>
	</div>

	<div
		class="bg-white rounded px-4 py-2 relative z-0 tree-holder font-mono"
		style:--highlight-yellow="rgb(254 240 138 / 80%)"
	>
		<div>
			{#each tree.children as root_node}
				{@render tree_display(root_node)}
			{/each}
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<svg class="absolute left-0 right-0 top-0 bottom-0 w-full h-full z-0">
			<defs>
				<marker
					id="arrow"
					viewBox="0 0 10 10"
					refX="9"
					refY="5"
					markerWidth="10"
					markerHeight="10"
					orient="auto-start-reverse"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" />
				</marker>
			</defs>

			{#each arrows as arrow}
				<g
					style="z-index: 1;"
					onmouseenter={() => {
						// source_paths_to_highlight.add(`root/${arrow.effect_path}`);
						effect_paths_to_highlight.add(`root/${arrow.effect_path}`);
						source_paths_to_highlight.add(`root/${arrow.source_path}`);
					}}
					onmouseleave={() => {
						// source_paths_to_highlight.delete(`root/${arrow.effect_path}`);
						effect_paths_to_highlight.delete(`root/${arrow.effect_path}`);
						source_paths_to_highlight.delete(`root/${arrow.source_path}`);
					}}
				>
					<path
						fill="none"
						stroke={effect_paths_to_highlight.has(`root/${arrow.effect_path}`) ? "yellow" : "transparent"}
						opacity="50%"
						stroke-width="9"
						stroke-linecap="round"
						d={arrow.arrow_path}
						style="z-index: 1;"
					/>
					<path
						fill="none"
						stroke="#000"
						stroke-width="1"
						stroke-linecap="round"
						marker-end="url(#arrow)"
						d={arrow.arrow_path}
						style="z-index: 1;"
					/>
				</g>
			{/each}
			<!-- Text after arrows to ensure they aren't drawn under any arrows -->
			{#each arrows as arrow}
				{@const should_show_text =
					hover_paths.has(`root/${arrow.effect_path}`) ||
					effect_paths_to_highlight.has(`root/${arrow.effect_path}`) ||
					relationship_text_display === "always"}
				<text
					x={arrow.text_pos.x}
					y={arrow.text_pos.y}
					style="z-index: 2; transform: translate(0px, 1.1rem)"
					class="pointer-events-none"
					fill={should_show_text ? "black" : "transparent"}
					stroke-width="5"
					stroke-linejoin="round"
					stroke={should_show_text ? "hsl(0 0% 100% / 90%)" : "transparent"}
					paint-order="stroke"
				>
					{arrow.relationship}
				</text>
			{/each}
		</svg>
	</div>
</div>

<style>
	.tree-node {
		&:last-child::before {
			border-color: lch(90% 10 var(--hue));
			content: "";
			height: 100%;
			position: absolute;
			border-style: solid;
			border-left-width: 1px;
			right: 100%;
			box-sizing: border-box;
		}

		& > :first-child {
			border-color: inherit;
			position: relative;
			/* position: sticky; */
			/* top: calc(var(--level, 0) * 1rem); */

			&::before {
				content: "";
				position: absolute;
				right: calc(100% + 4px);
				height: 0.9rem;
				bottom: calc(50% - 1px);
				width: 7px;
				border-style: solid;
				border-width: 1px;
				border-color: inherit;
				border-right: none;
				border-top: none;
			}
		}
	}
</style>
