import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const existsAsync = promisify(fs.exists);

export type Asset = string | AssetGlob;

export interface AssetGlob {
  glob: string;
  input: string;
  output: string;
}

export interface AngularJson {
  projects: { [name: string]: AngularJsonProject };
}

export interface AngularJsonProject {
  root: string;
  architect: {
    [type in AngularJsonProjectArchitectType]?: AngularJsonProjectArchitect
  };
}

export type AngularJsonProjectArchitectType = 'build' | 'test';

export interface AngularJsonProjectArchitect {
  options: {
    index?: string;
    tsConfig: string;
    assets: Asset[];
  };
}

export interface AngularCliJson {
  apps: AngularCliJsonApp[];
}

export interface AngularCliJsonApp {
  name: string;
  root: string;
  assets: Asset[];
  index: string;
  tsconfig: string;
}

export async function getAngularJsonPath(): Promise<string> {
  const angularJsonPath = path.resolve('./angular.json');
  const angularCliJsonPath = path.resolve('./.angular-cli.json');
  if (await existsAsync(angularJsonPath)) {
    return angularJsonPath;
  } else if (await existsAsync(angularCliJsonPath)) {
    return angularCliJsonPath;
  } else {
    throw new Error(
      'Unable to find angular.json or .angular-cli.json in current directory'
    );
  }
}

export async function getAngularJson(): Promise<AngularJson | AngularCliJson> {
  return require(await getAngularJsonPath());
}

export function isAngularJson(json: any): json is AngularJson {
  return json && !!json.projects;
}

export function isAngularJsonProject(json: any): json is AngularJsonProject {
  return json && !!json.architect;
}

export function isAngularCliJson(json: any): json is AngularCliJson {
  return json && Array.isArray(json.apps);
}

export function isAngularJsonEs5(
  json: AngularJsonProject,
  type: AngularJsonProjectArchitectType
): boolean {
  const architect = json.architect[type];
  if (architect) {
    const tsconfig = require(path.resolve(
      json.root,
      architect.options.tsConfig
    ));
    return isEs5(tsconfig);
  } else {
    return false;
  }
}

export function isAngularCliJsonEs5(json: AngularCliJsonApp): boolean {
  const tsconfig = require(path.resolve(json.root, json.tsconfig));
  return isEs5(tsconfig);
}

export function isEs5(tsconfig: any): boolean {
  return tsconfig.compilerOptions.target.toLowerCase() === 'es5';
}

export function getRelativeNodeModulesPath(
  json: AngularJsonProject | AngularCliJsonApp
): string {
  return path.relative(
    path.resolve(json.root),
    path.resolve('./node_modules/')
  );
}
