export function initPicker(token: string, onPicked: (folderId: string) => void) {
  // @ts-ignore
  window.gapi.load('picker', () => {
    // @ts-ignore
    const view = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder')
    // @ts-ignore
    const picker = new (window as any).google.picker.PickerBuilder()
      .enableFeature((window as any).google.picker.Feature.NAV_HIDDEN)
      .setOAuthToken(token)
      .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY!)
      .addView(view)
      .setCallback((data: any) => {
        if (data.action === 'picked') {
          const folderId = data.docs?.[0]?.id
          if (folderId) onPicked(folderId)
        }
      }).build()
    picker.setVisible(true)
  })
}
