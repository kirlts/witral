// Witral - Groups HTML Template

export function getGroupsHTML(groups: any[]): string {
  const monitoredGroups = groups.filter(g => g.isMonitored);
  
  if (monitoredGroups.length === 0) {
    return '<p class="text-gray-500">No monitored groups. Use the CLI to add groups.</p>';
  }

  return `
    <ul class="space-y-2">
      ${monitoredGroups.map(group => `
        <li class="flex items-center justify-between p-2 bg-gray-50 rounded">
          <span>${group.name} ${group.participants ? `(${group.participants} participants)` : ''}</span>
          <button 
            hx-delete="/web/api/groups/${encodeURIComponent(group.name)}"
            hx-target="#groups-list"
            hx-swap="innerHTML"
            class="text-red-500 hover:text-red-700 px-2 py-1 rounded"
          >
            Delete
          </button>
        </li>
      `).join('')}
    </ul>
  `;
}
