export const mockStorageData = {
  total: '10 GB',
  used: '6.8 GB',
  available: '3.2 GB',
  breakdown: [
    { category: 'Photos', size: '2.4 GB', count: 1245 },
    { category: 'Videos', size: '3.1 GB', count: 120 },
    { category: 'Documents', size: '850 MB', count: 346 },
    { category: 'Other', size: '450 MB', count: 85 }
  ]
};

export const mockAiSuggestions = [
  {
    id: 'sugg_1',
    title: 'Duplicate Images Detected',
    reason: 'Found 12 duplicate photos consuming 1.2 GB of storage.',
    size: '1.2 GB',
    route: '/duplicates'
  },
  {
    id: 'sugg_2',
    title: 'Large Video Files',
    reason: '5 large videos exceeding 100 MB are using 850 MB.',
    size: '850 MB',
    route: '/large-files'
  },
  {
    id: 'sugg_3',
    title: 'Old Unaccessed Files',
    reason: '18 files have not been opened for over 1 year.',
    size: '620 MB',
    route: '/files'
  }
];

export const mockRecentFiles = [
  { id: 'file_1', name: 'Vacation_Capture.jpg', size: '4.2 MB', type: 'img', date: 'Today, 2:15 PM' },
  { id: 'file_2', name: 'Project_Report.pdf', size: '2.8 MB', type: 'pdf', date: 'Yesterday' },
  { id: 'file_3', name: 'Design_Mockup.zip', size: '45.0 MB', type: 'zip', date: 'Oct 2, 2026' }
];