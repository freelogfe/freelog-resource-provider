import { ValidatorResult } from 'jsonschema';
export interface CreateResourceOptions {
    userId: number;
    username: string;
    resourceType: string;
    name: string;
    intro?: string;
    policies?: PolicyInfo[];
    coverImages?: string[];
    tags?: string[];
}
export interface UpdateResourceOptions {
    resourceId: string;
    intro?: string;
    coverImages?: [string];
    tags?: string[];
    policyChangeInfo?: object;
}
export interface CreateResourceVersionOptions {
    version: string;
    versionId: string;
    fileSha1: string;
    description: string;
    systemProperty?: object;
    dependencies?: BaseResourceInfo[];
    baseUpcastResources?: BaseResourceInfo[];
    resolveResources?: object[];
    customPropertyDescriptors?: object[];
}
export interface UpdateResourceVersionOptions {
    resolveResources?: object[];
    description?: string;
    customPropertyDescriptors?: object[];
}
export interface GetResourceDependencyOrAuthTreeOptions {
    maxDeep?: number;
    omitFields?: string[];
    isContainRootNode?: boolean;
}
export interface PolicyInfo {
    policyId: string;
    policyName?: string;
    policyText: string;
    status?: number;
    fsmDescriptionInfo?: object;
}
export interface ResourceInfo {
    resourceId?: string;
    resourceName: string;
    resourceType: string;
    userId: number;
    username: string;
    resourceVersions: object[];
    baseUpcastResources: object[];
    intro?: string;
    coverImages?: string[];
    policies?: PolicyInfo[];
    uniqueKey?: string;
    status: number;
    latestVersion?: string;
    tags?: string[];
}
export interface BaseResourceInfo {
    resourceId: string;
    resourceName?: string;
    versionRange?: string;
}
export interface ResourceVersionInfo {
    resourceId: string;
    resourceName: string;
    userId: number;
    versionId: string;
    version: string;
    resourceType: string;
    fileSha1: string;
    description?: string;
    dependencies: BaseResourceInfo[];
    upcastResources?: BaseResourceInfo[];
    resolveResources?: object[];
    systemProperty?: object;
    customPropertyDescriptors?: object[];
    status: number;
}
export interface CollectionResourceInfo {
    resourceId: string;
    resourceName: string;
    resourceType: string;
    userId: number;
    authorId: number;
    authorName: string;
}
/**
 * 针对object做校验的基础接口
 */
export interface IJsonSchemaValidate {
    validate(instance: object[] | object, ...args: any[]): ValidatorResult;
}
export interface IResourceService {
    createResource(options: CreateResourceOptions): Promise<ResourceInfo>;
    updateResource(resourceInfo: ResourceInfo, options: UpdateResourceOptions): Promise<ResourceInfo>;
    getResourceDependencyTree(resourceInfo: ResourceInfo, versionInfo: ResourceVersionInfo, options: GetResourceDependencyOrAuthTreeOptions): Promise<object[]>;
    getResourceAuthTree(resourceInfo: ResourceInfo, versionInfo: ResourceVersionInfo): Promise<object[]>;
    findByResourceId(resourceId: string, ...args: any[]): Promise<ResourceInfo>;
    findOneByResourceName(resourceName: string, ...args: any[]): Promise<ResourceInfo>;
    findByResourceNames(resourceNames: string[], ...args: any[]): Promise<ResourceInfo[]>;
    findOne(condition: object, ...args: any[]): Promise<ResourceInfo>;
    find(condition: object, ...args: any[]): Promise<ResourceInfo[]>;
    findPageList(condition: object, page: number, pageSize: number, projection: string[], orderBy: object): Promise<ResourceInfo[]>;
    count(condition: object): Promise<number>;
    createdResourceVersionHandle(resourceInfo: ResourceInfo, versionInfo: ResourceVersionInfo): Promise<boolean>;
}
export interface IResourceVersionService {
    createResourceVersion(resourceInfo: ResourceInfo, options: CreateResourceVersionOptions): Promise<ResourceVersionInfo>;
    updateResourceVersion(versionInfo: ResourceVersionInfo, options: UpdateResourceVersionOptions): Promise<ResourceVersionInfo>;
    find(condition: object, ...args: any[]): Promise<ResourceVersionInfo[]>;
    findOne(condition: object, ...args: any[]): Promise<ResourceVersionInfo>;
    saveOrUpdateResourceVersionDraft(resourceInfo: ResourceInfo, draftData: object): any;
    getResourceVersionDraft(resourceId: string): any;
    checkFileIsCanBeCreate(fileSha1: string): Promise<boolean>;
}
export interface ICollectionService {
    collectionResource(model: CollectionResourceInfo): Promise<CollectionResourceInfo>;
    isCollected(resourceIds: string[]): Promise<Array<{
        resourceId: string;
        isCollected: boolean;
    }>>;
    find(condition: object, ...args: any[]): Promise<CollectionResourceInfo[]>;
    findOne(condition: object, ...args: any[]): Promise<CollectionResourceInfo>;
    deleteOne(condition: object): Promise<boolean>;
    findPageList(resourceType: string, keywords: string, resourceStatus: number, page: number, pageSize: number): any;
}