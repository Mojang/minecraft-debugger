# Changelog

## Version 0.1.0 (September 2021)

- Initial release, connect to Minecraft Bedrock Edition to debug GameTest scripts.

## Version 0.1.2 (March 2022)

- Fixed bug where stale JavaScript threads were not being removed from the UI.

## Version 0.2.0 (April 2022)

- Support for TypeScript debugging.

## Version 0.3.0 (April 2022)

- Better TypeScript support.

## Version 0.3.1 (August 2022)

- Fix bug in source path comparison on Windows due to drive letter capitalization.

## Version 0.4.0 (August 2022)

- Add support for source maps that contain absolute paths.

## Version 0.5.0 (September 2022)

- Changes to the source path location in Minecraft require that localRoot points to a directory with sources, not the pack root. Update your launch.json 'localRoot'.

## Version 0.6.0 (September 2022)

- Add support for external modules while debugging. For JS modules built into Minecraft, stack will be visible but listed as "unknown". Add configuration support for module name mapping.

## Version 0.6.1 (December 2022)

- Better error messaging when source files cannot be discovered.

## Version 0.7.0 (March 2023)

- Support for inline source maps. Paths with %appdata% will be replaced with user app data folder.

## Version 0.8.0 (April 2023)

- Add "All Exceptions" option to breakpoints panel, enabling will instruct Minecraft to break at exceptions.

## Version 1.0.0 (May 2023)

- Update node dependencies.

## Version 1.1.0 (June 2023)

- Fix ignored 'stop' event, which caused missing variables and stack frame.

## Version 1.1.1 (September 2023)

- Handle uncaught exceptions during .map file discovery against invalid directory. Write to log and pop notification message.

## Version 1.2.0 (September 2023)

- Add 'Minecraft Diagnostics' panel to debugger view. Display script memory stats.

## Version 1.3.0 (February 2024)

- Expose source map lookup bias parameter "sourceMapBias" to the launch config to account for variations in how source maps are generated. Changing this from the default can fix breakpoint line number alignment issues between original source (ts) and generated source (js). Defaults to "leastUpperBound" and can be changed to "greatestLowerBound".

## Version 1.3.1 (April 2024)

- Remove extra line break in logs from MC.

## Version 1.4.0 (May 2024)

- Add targetModuleUuid to launch config, this ensures debugger messages (breakpoints etc) target the correct Minecraft Add-On.
