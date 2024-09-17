<script>
    import { CodeBlock } from '@skeletonlabs/skeleton';
	import { SvelteSet } from 'svelte/reactivity';

	let trigger_definitions = $state(`prop/path/1 -> prop/path/3
prop/path/1 -> prop/path/2 : relationship`);

	/**
	 @typedef {string} SchemaPath e.g. 'path/to/{dynamic}/resource'
	 @typedef {`${SchemaPath} --> ${SchemaPath} : ${string}`} TriggerDefinition e.g. 'source -> effect : relationship'
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
	function build_tree(triggers){
		try {
			/** @type {TreeNode} */
			let root = {
				key: 'root',
				path: 'root',
				children: [],
                effects: [],
                sources: []
			};

			let trigger_defs = /** @type {TriggerDefinition[]} */ (triggers.split(/\n+/).map(t => t.trim()).filter(t => t));

			// Compose the full object
			for (let trigger_def of trigger_defs){
				let [source_path, effect_path, relationship] = trigger_def.split(/ ?-> ?| ?: ?/g);
				let source_props = source_path.split('/').filter(p => p);
				let effect_props = effect_path.split('/').filter(p => p);

				let ref_node = root;
				for (let next_key of source_props){
					let child_node = ref_node.children.find(c => c.key === next_key)
					if (!child_node){
						child_node = {
							key: next_key,
							path: `${ref_node.path}/${next_key}`,
							children: [],
                            effects: [],
                            sources: []
						}
						ref_node.children.push(child_node);
                        ref_node.children.sort((a, b) => a.key.localeCompare(b.key));
					}

					if (next_key === source_props.at(-1)){
						child_node.effects.push({
							path: `root/${effect_path}`,
							relationship
						});
					}

					ref_node = child_node;
				}
				ref_node = root;
				for (let next_key of effect_props){
					let child_node = ref_node.children.find(c => c.key === next_key)
					if (!child_node){
						child_node = {
							key: next_key,
							path: `${ref_node.path}/${next_key}`,
							children: [],
                            effects: [],
                            sources: []
						};
						ref_node.children.push(child_node);
                        ref_node.children.sort((a, b) => a.key.localeCompare(b.key));
					}

                    if (next_key === effect_props.at(-1)){
						child_node.sources.push({
							path: `root/${source_path}`,
							relationship
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
		arrows = generate_arrow_paths(trigger_definitions)
	});

	/** 
	 * @param {string} trigger_definitions
	 * @returns {Arrow[]}
	*/
	function generate_arrow_paths(trigger_definitions){
		// if (typeof document === 'undefined'){
		// 	return [];
		// }

		/** @type {Arrow[]} */
		let result = [];

		let existing_paths = document.querySelectorAll('[data-remove-me]');
		existing_paths.forEach(s => s.remove());
		let trigger_def_array = trigger_definitions.split('\n');
		
		let on_page_svg = document.querySelector('svg');
		console.log(on_page_svg);

		let svg_rect = on_page_svg?.getBoundingClientRect();
		if (!svg_rect) {
			return [];
		}

		on_page_svg?.setAttribute('viewBox', `0 0 ${svg_rect.width} ${svg_rect.height}`);

		for (let trigger_def of trigger_def_array){
			let [source_path, effect_path, relationship] = trigger_def.split(/ ?-> ?| ?: ?/g);
			let source_rect = document.querySelector(`[data-path="root/${source_path}"] .key`)?.getBoundingClientRect();
			let effect_rect = document.querySelector(`[data-path="root/${effect_path}"] .key`)?.getBoundingClientRect();

			if (!source_rect || !effect_rect) break;

			let jutting = 20 + (Math.abs(source_rect.y - effect_rect.y)*0.5)
			
			let arrow_path = `
				M${source_rect.x - svg_rect.x + source_rect.width + 5},${source_rect.y - svg_rect.y + source_rect.height - 7} 
				C${source_rect.x- svg_rect.x + source_rect.width + 5 + jutting},${source_rect.y - svg_rect.y + source_rect.height - 7}
				${effect_rect.x- svg_rect.x + effect_rect.width + 5 + jutting},${effect_rect.y - svg_rect.y + 7}
				${effect_rect.x- svg_rect.x + effect_rect.width + 5},${effect_rect.y - svg_rect.y + 7}`;

			let text_pos = {
				x: effect_rect.x - svg_rect.x + effect_rect.width + 20,
				y: effect_rect.y - svg_rect.y
			}

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
     * 
     * @param {() => void} callback
     */
    function debounced(callback){
        /** @type {any} */
        let timeout_id;
        return () => {
            clearTimeout(timeout_id);
            timeout_id = setTimeout(
                callback,
                100
            );
        }
    }

    function regenerate_svg(){
        arrows = generate_arrow_paths(trigger_definitions);
    }
</script>

<svelte:window onresize={debounced(regenerate_svg)}/>

{#snippet tree_display(/** @type {TreeNode} */ n)}
	{@const root_node = /** @type {TreeNode} */ (n)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		data-path={root_node.path}
		class="
			relative z-10
			border-l border-solid
		"
        style:--override-bg={effect_paths_to_highlight.has(root_node.path) ? "rgb(254 240 138 / 0.5)" : ""}
	>
		<div 
			class=" key w-max flex items-center "
            
            style="background-color: var(--override-bg, {source_paths_to_highlight.has(root_node.path) ? "rgb(254 240 138 / 0.5)" : ""})"

			onmouseenter={() => {

                hover_paths.add(root_node.path);
                console.log("hover paths: ", [...hover_paths]);
               
                if (root_node.effects.length > 0){
                   console.log(`ADDING SOURCE ${root_node.path}`)
                    source_paths_to_highlight.add(root_node.path);
    				for (let effect of root_node.effects){
                        console.log(`> ADDING EFFECT ${effect.path}`);
    					effect_paths_to_highlight.add(effect.path);
    				}
                }

                if (root_node.sources.length > 0){
                   console.log(`ADDING EFFECT ${root_node.path}`)
                    effect_paths_to_highlight.add(root_node.path);
    				for (let source of root_node.sources){
                        console.log(`> ADDING SOURCE ${source.path}`);
    					source_paths_to_highlight.add(source.path);
    				}
                }
			}}
			onmouseleave={() => {
                hover_paths.delete(root_node.path);
                console.log("hover paths: ", [...hover_paths]);

                if (root_node.effects.length > 0){
    				console.log(`DELETING SOURCE ${root_node.path}`);
                    source_paths_to_highlight.delete(root_node.path);
    				for (let effect of root_node.effects){
                        console.log(`> DELETING EFFECT ${effect.path}`);
    					effect_paths_to_highlight.delete(effect.path);
    				}
                }

                if (root_node.sources.length > 0){
                    console.log(`DELETING EFFECT ${root_node.path}`);
                    effect_paths_to_highlight.delete(root_node.path);
    				for (let source of root_node.sources){
                        console.log(`> DELETING SOURCE ${source.path}`);
    					source_paths_to_highlight.delete(source.path);
    				}
                }
			}}
		>
			
            {#if root_node.children?.length === 0}
                {@html `${root_node.key}/: {...}`}
            {:else}
                {root_node.key}/
            {/if}
		</div>
		<div class="pl-4">
			{#each (root_node.children ?? []) as child_node}
				{@render tree_display(child_node)}
			{/each}
		</div>
	</div>
{/snippet}

<div class="p-6 font-mono">
	<textarea class="w-full h-[13rem] rounded" bind:value={trigger_definitions}></textarea>

	<div class="bg-white rounded px-4 py-2 relative z-0">
		{#each tree.children as root_node}
			{@render tree_display(root_node)}
		{/each}
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
				<path
					fill="none"
					stroke={effect_paths_to_highlight.has('root/' + arrow.effect_path) ? "yellow" : "transparent"}
					opacity="50%"
					stroke-width="7"
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
            {/each}
            {#each arrows as arrow}
                {@const should_show = hover_paths.has(`root/${arrow.effect_path}`) || effect_paths_to_highlight.has(`root/${arrow.effect_path}`)}
				<text
					x={arrow.text_pos.x} y={arrow.text_pos.y}
					style="z-index: 2; transform: translate(0px, 1.1rem)"
					fill={should_show ? "black" : "transparent"}
                    stroke-width="5"
                    stroke-linejoin="round"
                    stroke={should_show ? "hsl(0 0% 100% / 90%)" : "transparent"}
                    paint-order="stroke"
				>
					{arrow.relationship}
				</text>
			{/each}
		</svg>
	</div>
</div>
