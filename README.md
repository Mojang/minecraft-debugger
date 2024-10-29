<h1 align="center">
  <br>
  Minecraft Bedrock Edition JavaScript Debugger
  <br>
</h1>

<h4 align="center">Debug your JavaScript code running in Minecraft Bedrock Edition, from Visual Studio Code.</h4>

This Visual Studio Code extension will assist in debugging your JavaScript code when used in Minecraft Bedrock Edition clients and within Bedrock Dedicated Server. See more about the JavaScript capabilities at https://aka.ms/startwithmcscript, and see https://aka.ms/mcscriptdebugging for more on how to get started with script debugging in Minecraft.

### Supported features

* Setting breakpoints
* Stepping through the code
* The Locals pane
* Watches
* Performance diagnostics
* Running Minecraft slash commands

### Unsupported scenarios

* Changing variable state
* Immediate mode

## Getting Started

Your first step will be to install the Visual Studio Code Extension from the Visual Studio Marketplace.

[Install the Minecraft Bedrock Edition Debugger extension](https://aka.ms/vscodescriptdebugger)

See more information on Minecraft Bedrock Edition, GameTest, and debugging at https://aka.ms/mcscriptdebugging.

### For debugging Minecraft Bedrock Edition client inside Visual Studio Code

To use debugger capabilities, you'll want to install the Minecraft Bedrock Edition Debugger within Visual Studio Code. To do this, please click on the button below to download the **Minecraft Bedrock Edition Debugger** from Visual Studio Code's marketplace.

#### Ensure that the Minecraft Bedrock Edition client can make "loopback" requests

If you want to connect Minecraft Bedrock Edition client to Visual Studio Code running on the same machine (this is the most common scenario), you will need to exempt the Minecraft client from UWP loopback restrictions. To do this, run the following from a command prompt or the Start | Run app.

Minecraft Bedrock Edition:

```powershell
CheckNetIsolation.exe LoopbackExempt -a -p=S-1-15-2-1958404141-86561845-1752920682-3514627264-368642714-62675701-733520436
```

Minecraft Bedrock Edition Preview:

```powershell
CheckNetIsolation.exe LoopbackExempt -a -p=S-1-15-2-424268864-5579737-879501358-346833251-474568803-887069379-4040235476
```

#### Open Visual Studio Code within your development_behavior_packs folder

In order for the debugger to know where to find your source JavaScript or TypeScript files, you'll need to specifically open up a window of Visual Studio Code relative to the behavior pack where your JavaScript or TypeScript source files are. This may be inside of Minecraft's development_behavior_packs folder (e.g., `localappdata%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\development_behavior_packs`) - or you may have your source code located in a separate folder (e.g., `c:\projects\myaddon`).

Open up a Visual Studio Code window pointed at the folder with your add-on script source.

#### Prepare Visual Studio Code for a connection

To debug with Minecraft Bedrock Edition, you'll need to connect from Minecraft and into Visual Studio Code. This set of steps assumes you are debugging on the same Windows machine that you are running Minecraft from, but you can also debug across machines and across clients if you want to. If you are debugging across devices, you may need to open up a port within your firewall on the machine that you are running Visual Studio Code within.

You'll want to configure Visual Studio Code to know how to connect to Minecraft. If you're using a sample project such as the TS starter [minecraft-scripting-samples/ts-starter](https://github.com/microsoft/minecraft-scripting-samples/tree/main/ts-starter), this .vscode/launch.json file is already configured for you. But if you're creating a project from scratch, follow these instructions:

At the root of the behavior pack you want to debug, add a `.vscode` subfolder. Add the following launch.json file into that `.vscode` folder.

If your source is in JavaScript and you are developing directly against that source (you do not use a script build process), you'll want to configure `launch.json` as follows:

```json
{
  "version": "0.3.0",
  "configurations": [
    {
      "type": "minecraft-js",
      "request": "attach",
      "name": "Debug with Minecraft",
      "mode": "listen",
      "preLaunchTask": "build",
      "targetModuleUuid": "7c7e693f-99f4-41a9-95e0-1f57b37e1e12",
      "localRoot": "${workspaceFolder}/",
      "port": 19144
   }
  ]
}
```

`localRoot` should point at the folder which contains your behavior pack with script within it.
Port 19144 is the default networking port for Minecraft Script Debugging.

In the example above, `targetModuleUuid` is an optional parameter that specifies the identifier of your script module, which is located in your behavior pack's `manifest.json` file. This is important to use if you are developing add-ons in Minecraft while there are multiple behavior packs with script active.

If your source is in a language like TypeScript that generates JavaScript for Minecraft, you will want to use `sourceMapRoot` and `generatedSourceRoot` parameters in `launch.json`:

```json
{
  "version": "0.3.0",
  "configurations": [
    {
      "type": "minecraft-js",
      "request": "attach",
      "name": "Debug with Minecraft",
      "mode": "listen",
      "preLaunchTask": "build",
      "targetModuleUuid": "7c7e693f-99f4-41a9-95e0-1f57b37e1e12",
      "sourceMapRoot": "${workspaceFolder}/dist/debug/",
      "generatedSourceRoot": "${workspaceFolder}/dist/scripts/",
      "port": 19144
   }
  ]
}
```

Note that `generatedSourceRoot` should point at a folder where your generated JavaScript files (*.js) are stored - for example, the outputs of a TypeScript build process. `sourceMapRoot` should point at a folder where you have source map files - typically created during your build process - that tie your generated JavaScript source files back to your potential TypeScript source.

#### Run your Minecraft Behavior Pack

Now that you've prepared Visual Studio Code and prepared your behavior pack, you're ready to start debugging!

Within Visual Studio Code, click the "Debug with Minecraft" option under the Run menu (or hit F5) to start debugging. This will place Visual Studio Code into "Listen Mode", where it awaits a connection from Minecraft.

Start Minecraft and load into a world with your scripting behavior pack.

Use this slash command to connect Minecraft to Visual Studio Code:

`script debugger connect`

You should see a "Debugger connected to host" response from this command if the connection is successful.

You can set breakpoints in your code by clicking on the left-hand side of the editor, on specific lines of code. As you run the tests in the behavior pack, your breakpoints should be hit. You can also view local variables and add watches as necessary.

### Debugging with Minecraft Bedrock Dedicated Server

The procedure for debugging with Bedrock Dedicated Server is a little different. When debugging with Bedrock Dedicated Server, Bedrock Dedicated Server (not Visual Studio Code) will listen for debug connections initiated from Visual Studio Code. You'll want to start by installing the Minecraft Bedrock Edition Debugger for Visual Studio Code as described above.

#### Configure your Bedrock Dedicated Server

By default, Bedrock Dedicated Servers are not configured to allow debug connections. To enable this debugging, you'll need to change some settings within the `server.properties` file of your Bedrock Dedicated Server.

These settings configure debugging on Bedrock Dedicated Server:

* `allow-outbound-script-debugging` (true/false): enables the /script debugger connect command. Defaults to false.
* `allow-inbound-script-debugging` (true false): enables the /script debugger listen command (and the opening of ports on a server).  Defaults to false.
* `force-inbound-debug-port` (number): Locks the inbound debug port to a particular port. This will set the default script debugging port and prevent a user of the /script debugger listen command from specifying an alternate port.

Within Bedrock Dedicated Server's console, use this slash command to start listening on a port:

`script debugger listen 19144`

You should see a "Debugger listening" response from this command.

Within Visual Studio Code, you'll want to configure your debug settings in `launch.json` to have Visual Studio connect to Dedicated Server. To do this, set "mode" to "connect".

```json
{
    "version": "0.3.0",
    "configurations": [
      {
        "type": "minecraft-js",
        "request": "attach",
        "name": "Debug with Minecraft",
        "mode": "connect",
        "preLaunchTask": "build",
        "sourceMapRoot": "${workspaceFolder}/dist/debug/",
        "generatedSourceRoot": "${workspaceFolder}/dist/scripts/",
        "port": 19144
      }
    ]
  }
```

Now, hit "Start Debugging" inside of Visual Studio Code.

As with when you debug against Minecraft clients, you can set breakpoints in your code by clicking on the left-hand side of the editor, on specific lines of code.

#### Minecraft Debugger Home Panel
The Activity Bar icon ![image](/icons/creeper_icon.png) will open the Minecraft Debugger home panel. Here you will find shortcuts for common actions, like opening Settings and showing the Diagnostics panel.

##### Minecraft Command Shortcuts
Add shortcuts for your favorite Minecraft commands.

##### Script Profiler
After setting a local path for saving captures, use `Start Profiler` and `Stop Profiler` to create performance captures of your actively running add-on.

#### Diagnostics Window
When attatched to a game server running Minecraft 1.21.10 or above, the debugger can display high level statistics to help diagnost performance issues.

To open this view, run the command `Minecraft Diagnostics: Show` or click the sidebar icon for the exension ![image](/icons/creeper_icon.png) and click the "Show Diagnostics" button.

The server statistics it displays currently are:
- Number of entities in the level (all dimensions)
- Chunks (loaded state, per dimension)
- Commands run per tick based on high level category
- Memory usage of the entire Minecraft executable
- Memory usage of the scripting JavaScript runtime
- Server tick time (target of 20Hz/50ms) with high level categories
- Network packet bandwidth usage
- Network packet packet count (all and specific packet counts)
- Entity handle counts per scripting pack (useful for detecting handle leaks)


Example diagnostics view
![image](https://github.com/Mojang/minecraft-debugger/assets/1000311/fcafd4da-6017-4348-86df-571974b50012)


## Feedback

Send us your feedback by [filing an issue](https://github.com/mojang/minecraft-debugger/issues/new) against this extension's [GitHub repo](https://github.com/mojang/minecraft-debugger).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
