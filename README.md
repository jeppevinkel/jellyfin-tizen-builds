# jellyfin-tizen-builds
The purpose of this repository is to automatically build the most up-to-date version of jellyfin-tizen.

## Installation
### Prerequisites
- Tizen Studio with CLI (https://developer.tizen.org/development/tizen-studio/download)
- One of the .wgt files from a release (https://github.com/jeppevinkel/jellyfin-tizen-builds/releases)

### Getting Started
1. Install prerequisites. Yup nothing else needed.

### Deploy to TV
1. Activate Developer Mode on TV (https://developer.samsung.com/tv/develop/getting-started/using-sdk/tv-device).
2. Connect to TV with Device Manager from Tizen Studio. Typically located in `C:\tizen-studio\tools\device-manager\bin`
3. Install the package.  
   This command assumes the file you are installing is called `Jellyfin.wgt`. Simply change it to `Jellyfin-prerelease.wgt` if you are installing the prerelease version. Otherwise you can also just rename the file.
```bash
tizen install -n Jellyfin.wgt -t <the name of your tv>
```
typically locatedi in (C:\tizen-studio\tools\ide\bin)
> You can find your tv name in Device Manager from Tizen Studio or using `sdb devices`.  
