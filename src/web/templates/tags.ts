// Witral - Tags HTML Template
// Template for displaying tags list in the web dashboard

export function getTagsHTML(tags: any[]): string {
  if (tags.length === 0) {
    return '<p class="text-gray-500">No tags configured</p>';
  }

  return `
    <ul class="space-y-2">
      ${tags.map(tag => {
        // Escape values for safe use in HTML attributes
        const escapedName = tag.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const escapedSeparator = (tag.separator || ',,').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        // Use Base64 to pass fields array safely
        const fieldsBase64 = Buffer.from(JSON.stringify(tag.enabledFields)).toString('base64');
        
        return `
        <li class="flex items-center justify-between p-3 bg-gray-50 rounded">
          <div class="flex-1">
            <span class="font-medium">${tag.name}</span>
            ${tag.description ? `<p class="text-sm text-gray-500 mt-1">${tag.description}</p>` : ''}
            <p class="text-xs text-gray-400 mt-1">Fields: ${tag.enabledFields.join(', ')} | Separator: <code class="bg-gray-200 px-1 rounded">${tag.separator || ',,'}</code></p>
          </div>
          <div class="flex gap-2">
            <button 
              data-tag="${escapedName}"
              data-fields="${fieldsBase64}"
              data-separator="${escapedSeparator}"
              onclick="openConfigureFieldsModalFromButton(this)"
              class="text-blue-500 hover:text-blue-700 px-2 py-1 rounded text-sm"
            >
              Configure
            </button>
            <button 
              onclick="deleteTag('${escapedName}')"
              class="text-red-500 hover:text-red-700 px-2 py-1 rounded text-sm"
            >
              Delete
            </button>
          </div>
        </li>
      `}).join('')}
    </ul>
  `;
}
