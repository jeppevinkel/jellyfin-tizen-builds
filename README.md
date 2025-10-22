# jellyfin-tizen-builds
The purpose of this repository is to automatically build the most up-to-date version of jellyfin-tizen.

For real-time-ish communications, you can join my [Discord server](https://discord.gg/DGnRQUJ).

## Versions
| File name    | Description                                                                                                               |
|--------------|---------------------------------------------------------------------------------------------------------------------------|
| Jellyfin.wgt | Built with the latest stable release of jellyfin-web                                                                      |
| 10.11.z      | Built with the bleeding edge of the branch for the 10.11.z releases                                                       |
| 10.10.z      | Built with the bleeding edge of the branch for the 10.10.z releases                                                       |
| master       | Built with the latest potentially unstable changes to jellyfin-web code (this will always be the newest possible version) |
| TrueHD       | TrueHD support is enabled (whether it works or not might depend on TV model)                                              |
| secondary    | Built with the latest stable release of jellyfin-web and a different app ID to allow having a second account signed in    |
| OblongIcon   | Use oblong type icon for TVs required it.  See more detail: jellyfin/jellyfin-tizen#171                                   |
| GrayFix      | Potentially fixes an issue where the bars over and under the video are gray.  See more detail: jellyfin/jellyfin-tizen#65 |
| SmartHub     | Add Samsung Smart Hub Preview integration. See more detail: jellyfin/jellyfin-tizen#318                                   |

*Disclaimer: I don't have many success stories with TVs older than 2018, but a few people in my Discord server have reported it working for their 2015 and 2016 TVs with the `10.8.z` version. This version is not included in new releases, but can be found [here](https://github.com/jeppevinkel/jellyfin-tizen-builds/releases/tag/2024-10-27-1821)*

## Installation
For a GUI installer that automates most of the process, check out this program mady by PatrickSt1991 [PatrickSt1991/Samsung-Jellyfin-Installer](https://github.com/PatrickSt1991/Samsung-Jellyfin-Installer).  
For a one step install process using Docker, check out this guide made by Georift [Georift/install-jellyfin-tizen](https://github.com/Georift/install-jellyfin-tizen).  
*I have no affiliation with these installers and I can't provide support related to them. Both of the installers directly use the builds I provide here.*

### Prerequisites
- Tizen Studio with CLI (https://developer.tizen.org/development/tizen-studio/download)
- Visual C++ Redistributable Packages for VS 2013 x86 and amd64 (https://www.microsoft.com/en-US/download/details.aspx?id=40784)
- One of the .wgt files from a release (https://github.com/jeppevinkel/jellyfin-tizen-builds/releases)

### Getting Started
1. Install prerequisites. Yup nothing else needed.

### Deploy to TV
1. Activate Developer Mode on TV (https://developer.samsung.com/tv/develop/getting-started/using-sdk/tv-device).
2. Connect to TV with Device Manager from Tizen Studio. Typically located in `C:\tizen-studio\tools\device-manager\bin`
3. Install the package.  
   This command assumes the file you are installing is called `Jellyfin.wgt`. Simply change it to `Jellyfin-prerelease.wgt` if you are installing the prerelease version. Otherwise you can also just rename the file.
```bash
c:\tizen-studio\tools\ide\bin\tizen.bat install -n Jellyfin.wgt -t <the name of your tv>
```
On Mac the command is instead
```bash
$HOME/tizen-studio/tools/ide/bin/tizen install -n Jellyfin.wgt -t <the name of your tv>
```
typically located in (C:\tizen-studio\tools\ide\bin)
> You can find your tv name in Device Manager from Tizen Studio or using `sdb devices`.  

## Common issues

### Install failing due to wrong certificate?

This should only happen if you already have a version installed using a different build certificate.  
This can be solved by uninstalling the app prior to attempting to install this version.

Removing it from the app bar is not the same as removing it from the device, you need to actually go into the applications menu and remove it from there.


### Where do I find `sdb`?

If you installed Tizen Studio with CLI correctly, then you should find the `sdb` tool: 

On Windows
```bash
c:\tizen-studio\tools\sdb
```

On Mac
```bash
$HOME/tizen-studio/tools/sdb
```

On Linux
```bash
~/tizen-studio/tools/sdb
```

### The `sdb devices` command returns only this message "List of devices attached":

If you enabled developer mode on your TV correctly, then you need to do the following:

- Make sure the TV and the computer running the Tizen Studio with CLI are connected to the same network (for example, the same Wi-Fi)
- Discover the IP address of your TV. You can check the IP of your TV in the Settings > General > Network > Network Status > IP Settings. Or check this depending of your TV model (https://www.samsung.com/ca/support/tv-audio-video/verify-network-status-on-your-samsung-tv/)

Once you have the IP address of your TV connect to it by running this command:

On Windows
```bash
c:\tizen-studio\tools\sdb connect <IP of your TV>
```

On Mac
```bash
$HOME/tizen-studio/tools/sdb connect <IP of your TV>
```

On Linux
```bash
~/tizen-studio/tools/sdb connect <IP of your TV>
```

You should see a message like:
```bash
connecting to <IP of your TV>:26101 ...
connected to <IP of your TV>:26101
```

If you execute `sdb devices` you should now see your TV in the list, including the name used in the "Deploy to TV" section.
