<h1 align="center">
  <br>
  Minecraft Bedrock Edition Script Debugger
  <br>
</h1>

<h4 align="center">Debug your JavaScript code running as part Minecraft Bedrock Editions Script API features, from Visual Studio Code.</h4>

This Visual Studio Code extension will assist in debugging your JavaScript code when using scripting in Minecraft Bedrock Edition clients and within Bedrock Dedicated Server. See more about scripting and script API capabilities at https://aka.ms/startwithmcscript, and see https://aka.ms/mcscriptdebugging for more on how to get started with script debugging in Minecraft.

**Supported features**
* Setting breakpoints
* Stepping through the code
* The Locals pane
* Watches

**Unsupported scenarios**
* Changing variable state
* Immediate mode


## Getting Started

Your first step will be to install the Visual Studio Code Extension from the Visual Studio Marketplace.

[Install the Minecraft Bedrock Edition Debugger extension](https://aka.ms/vscodescriptdebugger)

See more information on Minecraft Bedrock Edition, Script API, and debugging at https://aka.ms/mcscriptdebugging.

### For debugging Minecraft Bedrock Edition client inside Visual Studio Code

1. If you wish to connect Minecraft Bedrock Edition client to Visual Studio Code running on the same PC (this is the most common scenario), you will need to exempt the Minecraft Bedrock Edition client from UWP loopback restrictions.  To do this for the main Minecraft game, run the following from a command prompt or from the Start | Run app.

```powershell
CheckNetIsolation.exe LoopbackExempt -a -p=S-1-15-2-1958404141-86561845-1752920682-3514627264-368642714-62675701-733520436
```

If you are using the Minecraft Preview application, run the following command:

```powershell
CheckNetIsolation.exe LoopbackExempt -a -p=S-1-15-2-424268864-5579737-879501358-346833251-474568803-887069379-4040235476
```

You will only need to run this once on your PC.

2. Open the folder containing the project you want to work on - likely you should open Visual Studio Code at `%localappdata%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\development_behavior_packs\(behaviorpackname)`.
3. Create `launch.json` within a `.vscode` subfolder of that project folder:

```json
{
  "version": "0.3.0",
  "configurations": [
    {
      "type": "minecraft-js",
      "request": "attach",
      "name": "Wait for Minecraft Debug Connections",
      "mode": "listen",
      "localRoot": "${workspaceFolder}/",
      "port": 19144
    }
  ]
}
```

4. Start Minecraft and load into a world with your scripting behavior pack.
5. Set a break point inside of your GameTest function.
6. Within Visual Studio Code, hit Run | Start Debugging to put Visual Studio Code in "Listen for Debug Connections" mode.
7. Back within Minecraft, use this slash command to connect to Visual Studio Code on a port.

```
/script debugger connect localhost 19144 
```

8. Trigger the code (likely by running a gametest, like `/gametest run <my test name>`)

You should see your breakpoints get triggered as the code executes. You can add watches or view locals to see more information about the state of JavaScript in your project.

### For debugging Minecraft Bedrock Dedicated Server Edition inside Visual Studio Code

By default, Bedrock Dedicated Servers are not configured to allow debug connections. To enable this debugging, you will need to change some settings within the `server.properties` file of your Bedrock Dedicated Server.

These settings configure debugging on Bedrock Dedicated Server:

 * `allow-outbound-script-debugging` (true/false) - enables the `/script debugger connect command`. Defaults to false.
 * `allow-inbound-script-debugging` (true false) - enables the `/script debugger listen command` (and the opening of ports on a server).  Defaults to false.
 * `force-inbound-debug-port` (number) - Locks the inbound debug port to a particular port. This will set the default script debugging port and prevent a user of the `/script debugger listen` command from specifying an alternate port.

1. To get started, edit `server.properties` and set `allow-inbound-script-debugging` to true.

2. Open the folder containing the project you want to work on - likely you should open Visual Studio Code at `(my Bedrock Dedicated Server path)\development_behavior_packs\(behaviorpackname)`.

```json
{  
  "version": "0.3.0",
  "configurations": [
    {
      "type": "minecraft-js",
      "request": "attach",
      "name": "Attach to Minecraft Bedrock Dedicated Server",
      "localRoot": "${workspaceFolder}/",
      "port": 19144
    }
  ]
}
```

3. Create `launch.json` within a `.vscode` subfolder of that project folder:

```json
{  
  "version": "0.3.0",
  "configurations": [
    {
      "type": "minecraft-js",
      "request": "attach",
      "name": "Attach to Minecraft Bedrock Dedicated Server",
      "localRoot": "${workspaceFolder}/",
      "port": 19144
    }
  ]
}
```

4. Within Bedrock Dedicated Server, run the following command:

```
/script debugger listen 19144 
```

5. Within Visual Studio Code, set a break point inside of your GameTest function.
6. Hit Run | Start Debugging to put Visual Studio Code to connect to Bedrock Dedicated Server.
7. Trigger the code (likely by running a gametest, like `/gametest run <my test name>`)
 
You should see your breakpoints get triggered as the code executes. You can add watches or view locals to see more information about the state of JavaScript in your project.

## Using sourcemap files in conjunction with the Minecraft debugger

In many cases, you may use a language with more features that "compiles to" JavaScript. One popular example is TypeScript, which adds many helpful developer features on top of JavaScript. Using a language like TypeScript typically require build tools or a build process that compiles your TypeScript into the JavaScript that Minecraft can run. You can find out more about using TypeScript and setting up a build process through [this tutorial article](https://docs.microsoft.com/minecraft/creator/documents/scriptinggettingstarted). 

To make the debugger function appropriately in conjunction with languages like TypeScript, you will need to let the debugger know where to find (a) your original TypeScript files, (b) your JavaScript files that are built from TypeScript, and (c) source map (typically .map) files that provide information for the debugger on how to connect between (a) and (b).

So, when you use the debugger in combination with a compiled language like TypeScript, you will need to adjust the configuration of `launch.json` in your `.vscode` folder to provide that additional information. Specifically, you will need two additional paths, in addition to configuring `localRoot`: 

 * `localRoot` should point at the folder location of your core TypeScript (or other higher-level) language files
 * A `generatedSourceRoot` attribute should be added which points at the folder location of your generated JavaScript files. This may be something like a build folder within your project.
 * An additional `sourceMapRoot` attribute is needed to specify to the debugger where it can find your generated source map files. In some cases, source map files may be generated alongside your JavaScript source, so your `sourceMapRoot` may be the same as `generatedSourceRoot`. 

Note that there may be additional configuration required in your build tools - for example, `gulp` or the TypeScript compiler `tsc` - to ensure that it generates source maps properly. If you are having problems getting the debugger to recognize breakpoints in your files, ensure that your built JavaScript files have a working reference to their corresponding source map file (typically listed at the bottom of a JS file in a JavaScript comment). Also, ensure that your source map file has a working reference to its corresponding source file (e.g., a TS file).

## Feedback
Send us your feedback by [filing an issue](https://github.com/mojang/minecraft-debugger/issues/new) against this extension's [GitHub repo](https://github.com/mojang/minecraft-debugger). 

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
