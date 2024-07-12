<script>
	let str = $state('')
</script>
<div class="p-6">
	<textarea bind:value={str}></textarea>
	<div>{str}</div>
</div>