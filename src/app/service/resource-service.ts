import {maxSatisfying} from 'semver';
import {provide, inject} from 'midway';
import {ApplicationError} from 'egg-freelog-base';
import {isArray, isUndefined, omit, isEmpty, uniqBy, chain} from 'lodash';
import {
    CreateResourceOptions, GetResourceDependencyOrAuthTreeOptions,
    IResourceService, PolicyInfo, ResourceInfo, ResourceVersionInfo, UpdateResourceOptions
} from '../../interface';
import * as semver from 'semver';

@provide('resourceService')
export class ResourceService implements IResourceService {

    @inject()
    ctx;
    @inject()
    resourceProvider;
    @inject()
    resourceVersionProvider;
    @inject()
    resourcePropertyGenerator;
    @inject()
    resourcePolicyCompiler;

    /**
     * 创建资源
     * @param {CreateResourceOptions} options 资源选项
     * @returns {Promise<ResourceInfo>}
     */
    async createResource(options: CreateResourceOptions): Promise<ResourceInfo> {

        const resourceInfo: ResourceInfo = {
            resourceName: `${options.username}/${options.name}`,
            resourceType: options.resourceType,
            userId: options.userId,
            username: options.username,
            intro: options.intro,
            coverImages: options.coverImages,
            policies: options.policies,
            resourceVersions: [],
            baseUpcastResources: [],
            tags: options.tags,
            status: 0
        };

        resourceInfo.status = ResourceService._getResourceStatus(resourceInfo);
        resourceInfo.uniqueKey = this.resourcePropertyGenerator.generateResourceUniqueKey(resourceInfo.resourceName);

        return this.resourceProvider.create(resourceInfo);
    }

    /**
     * 更新资源
     * @param {UpdateResourceOptions} options
     * @returns {Promise<ResourceInfo>}
     */
    async updateResource(resourceInfo: ResourceInfo, options: UpdateResourceOptions): Promise<ResourceInfo> {

        const updateInfo: any = {};
        if (isArray(options.coverImages)) {
            updateInfo.coverImages = options.coverImages;
        }
        if (!isUndefined(options.intro)) {
            updateInfo.intro = options.intro;
        }
        if (isArray(options.tags)) {
            updateInfo.tags = options.tags;
        }
        if (options.policyChangeInfo) {
            resourceInfo.policies = updateInfo.policies = this._policiesHandler(resourceInfo, options.policyChangeInfo);
            updateInfo.status = ResourceService._getResourceStatus(resourceInfo);
        }
        return this.resourceProvider.findOneAndUpdate({_id: options.resourceId}, updateInfo, {new: true});
    }

    /**
     * 获取资源依赖树
     * @param {GetResourceDependencyOrAuthTreeOptions} options
     * @returns {Promise<object[]>}
     */
    async getResourceDependencyTree(resourceInfo: ResourceInfo, versionInfo: ResourceVersionInfo, options: GetResourceDependencyOrAuthTreeOptions): Promise<object[]> {
        if (!options.isContainRootNode) {
            return this._buildDependencyTree(versionInfo.dependencies, options.maxDeep, 1, options.omitFields);
        }

        const rootTreeNode = {
            resourceId: resourceInfo.resourceId,
            resourceName: resourceInfo.resourceName,
            version: versionInfo.version,
            versions: resourceInfo.resourceVersions.map(x => x['version']),
            resourceType: resourceInfo.resourceType,
            versionRange: versionInfo.version,
            versionId: versionInfo.versionId,
            baseUpcastResources: resourceInfo.baseUpcastResources,
            dependencies: await this._buildDependencyTree(versionInfo.dependencies, options.maxDeep, 1, options.omitFields)
        };

        return [omit(rootTreeNode, options.omitFields)];
    }

    /**
     * 获取资源授权树
     * @param {ResourceInfo} resourceInfo
     * @param {ResourceVersionInfo} versionInfo
     * @returns {Promise<object[]>}
     */
    async getResourceAuthTree(resourceInfo: ResourceInfo, versionInfo: ResourceVersionInfo): Promise<object[]> {

        const options = {maxDeep: 100, omitFields: [], isContainRootNode: true};
        const dependencyTree = await this.getResourceDependencyTree(resourceInfo, versionInfo, options);

        const resourceVersionMap = await this._getAllVersionInfoFormDependencyTree(dependencyTree)
            .then(list => new Map(list.map(x => [x.versionId, x])));

        const recursionAuthTree = (dependencyTreeNode) => {
            const treeNodeVersionInfo = resourceVersionMap.get(dependencyTreeNode.versionId);
            return treeNodeVersionInfo.resolveResources.map(resolveResource => {
                const list = this._findResourceVersionFromDependencyTree(dependencyTreeNode.dependencies, resolveResource);
                return {
                    resourceId: resolveResource['resourceId'],
                    resourceName: resolveResource['resourceName'],
                    contracts: resolveResource['contracts'],
                    versions: uniqBy(list, x => x['versionId']).map(item => Object({
                        version: item['version'],
                        resolveReleases: recursionAuthTree(item)
                    })),
                    versionRanges: chain(list).map(x => x['versionRange']).uniq().value()
                };
            });
        };

        return recursionAuthTree(dependencyTree[0]);
    }

    /**
     * 根据资源名批量获取资源
     * @param {string[]} resourceNames 资源名称集
     * @param args
     * @returns {Promise<ResourceInfo[]>}
     */
    async findByResourceNames(resourceNames: string[], ...args): Promise<ResourceInfo[]> {
        const uniqueKeys = resourceNames.map(x => this.resourcePropertyGenerator.generateResourceUniqueKey(x));
        return this.resourceProvider.find({uniqueKey: {$in: uniqueKeys}}, ...args);
    }

    /**
     * 根据资源ID获取资源信息
     * @param {string} resourceId 资源ID
     * @returns {Promise<ResourceInfo>} 资源信息
     */
    async findByResourceId(resourceId: string, ...args): Promise<ResourceInfo> {
        return this.resourceProvider.findById(resourceId, ...args);
    }

    /**
     * 根据资源名获取资源
     * @param {string} resourceName
     * @param args
     * @returns {Promise<ResourceInfo>}
     */
    async findOneByResourceName(resourceName: string, ...args): Promise<ResourceInfo> {
        const uniqueKey = this.resourcePropertyGenerator.generateResourceUniqueKey(resourceName);
        return this.resourceProvider.findOne({uniqueKey}, ...args);
    }

    /**
     * 根据条件查找单个资源
     * @param {object} condition 查询条件
     * @param args
     * @returns {Promise<ResourceInfo>}
     */
    async findOne(condition: object, ...args): Promise<ResourceInfo> {
        return this.resourceProvider.findOne(condition, ...args);
    }

    /**
     * 根据条件查询多个资源
     * @param {object} condition 查询条件
     * @param args
     * @returns {Promise<ResourceInfo[]>}
     */
    async find(condition: object, ...args): Promise<ResourceInfo[]> {
        return this.resourceProvider.find(condition, ...args);
    }

    /**
     * 分页查找资源
     * @param {object} condition
     * @param {number} page
     * @param {number} pageSize
     * @param {string[]} projection
     * @param {object} orderBy
     * @returns {Promise<ResourceInfo[]>}
     */
    async findPageList(condition: object, page: number, pageSize: number, projection: string[], orderBy: object): Promise<ResourceInfo[]> {
        return this.resourceProvider.findPageList(condition, page, pageSize, projection.join(' '), orderBy);
    }

    /**
     * 按条件统计资源数量
     * @param {object} condition
     * @returns {Promise<number>}
     */
    async count(condition: object): Promise<number> {
        return this.resourceProvider.count(condition);
    }

    /**
     * 创建资源版本事件处理
     * @param {ResourceInfo} resourceInfo
     * @param {ResourceVersionInfo} versionInfo
     * @returns {Promise<boolean>}
     */
    async createdResourceVersionHandle(resourceInfo: ResourceInfo, versionInfo: ResourceVersionInfo): Promise<boolean> {

        resourceInfo.resourceVersions.push(versionInfo);
        const latestVersionInfo: any = resourceInfo.resourceVersions.sort((x, y) => semver.lt(x['version'], y['version']) ? 1 : -1).shift();

        return this.resourceProvider.updateOne({_id: resourceInfo.resourceId}, {
            $addToSet: {resourceVersions: versionInfo},
            latestVersion: latestVersionInfo.version
        }).then(data => Boolean(data.ok));
    }

    /**
     * 构建依赖树
     * @param dependencies
     * @param {number} maxDeep
     * @param {number} currDeep
     * @param {any[]} omitFields
     * @returns {Promise<any>}
     * @private
     */
    async _buildDependencyTree(dependencies, maxDeep = 100, currDeep = 1, omitFields = []) {

        if (!dependencies.length || currDeep++ > maxDeep) {
            return [];
        }

        const dependencyMap = new Map(dependencies.map(item => [item.resourceId, {versionRange: item.versionRange}]));
        const resourceList = await this.resourceProvider.find({_id: {$in: Array.from(dependencyMap.keys())}});

        const versionIds = [];
        for (let i = 0, j = resourceList.length; i < j; i++) {
            const {resourceId, resourceVersions} = resourceList[i];
            const dependencyInfo: any = dependencyMap.get(resourceId);
            const {version, versionId} = this._getResourceMaxSatisfying(resourceVersions, dependencyInfo.versionRange);

            dependencyInfo.version = version;
            dependencyInfo.versionId = versionId;
            dependencyInfo.versions = resourceVersions.map(x => x.version);
            versionIds.push(dependencyInfo.versionId);
        }

        const versionInfoMap = await this.resourceVersionProvider.find({versionId: {$in: versionIds}})
            .then(list => new Map(list.map(x => [x.versionId, x])));

        const results = [];
        const tasks = [];
        for (let i = 0, j = resourceList.length; i < j; i++) {
            const {resourceId, resourceName, resourceType, baseUpcastResources} = resourceList[i];
            const {versionId, versionRange, versions, version} = dependencyMap.get(resourceId) as any;
            const versionInfo = versionInfoMap.get(versionId);
            let result: any = {
                resourceId, resourceName, versions, version, resourceType, versionRange, baseUpcastResources, versionId
            };
            if (!isEmpty(omitFields)) {
                result = omit(result, omitFields);
            }
            tasks.push(this._buildDependencyTree(versionInfo.dependencies || [], maxDeep, currDeep, omitFields)
                .then(list => result.dependencies = list));
            results.push(result);
        }

        return Promise.all(tasks).then(() => results);
    }

    /**
     * 从依赖树中获取所有相关的版本信息
     * @param {any[]} dependencyTree
     * @returns {Promise<ResourceVersionInfo[]>}
     * @private
     */
    async _getAllVersionInfoFormDependencyTree(dependencyTree: any[]): Promise<ResourceVersionInfo[]> {

        const resourceVersionIdSet = new Set();

        const recursion = (dependencies) => dependencies.forEach((item) => {
            resourceVersionIdSet.add(item.versionId);
            recursion(item.dependencies);
        });

        recursion(dependencyTree);

        if (!resourceVersionIdSet.size) {
            return [];
        }
        return this.resourceVersionProvider.find({versionId: {$in: [...resourceVersionIdSet.values()]}});
    }

    /**
     * 从依赖树中获取指定的所有发行版本(查找多重上抛)
     * 例如深度2的树节点上抛了A-1.0,深度3节点也上抛了A-1.1.
     * 然后由深度为1的节点解决了A.授权树需要找到1.0和1.1,然后分别计算所有分支
     * @param dependencies
     * @param resource
     * @returns {Array}
     * @private
     */
    _findResourceVersionFromDependencyTree(dependencies, resource, _list = []): object[] {

        return dependencies.reduce((acc, dependencyTreeNode) => {
            if (dependencyTreeNode.resourceId === resource.resourceId) {
                acc.push(dependencyTreeNode);
            }
            // 如果依赖项未上抛该发行,则终止检查子级节点
            if (!dependencyTreeNode.baseUpcastResources.some(x => x.resourceId === resource.resourceId)) {
                return acc;
            }
            return this._findResourceVersionFromDependencyTree(dependencyTreeNode.dependencies, resource, acc);
        }, _list);
    }

    /**
     * 获取最匹配的semver版本
     * @param resourceVersions
     * @param versionRange
     * @returns {any}
     * @private
     */
    _getResourceMaxSatisfying(resourceVersions: any[], versionRange: string): { version: string, versionId: string } {

        const version = maxSatisfying(resourceVersions.map(x => x.version), versionRange);

        return resourceVersions.find(x => x.version === version);
    }

    /**
     * 获取资源状态
     * 1: 必须具备有效的策略
     * 2: 必须包含一个有效的版本
     * @param {ResourceInfo} resourceInfo 资源信息
     * @returns {number} 资源状态
     * @private
     */
    static _getResourceStatus(resourceInfo: ResourceInfo): number {
        return resourceInfo.policies.some(x => x['status'] === 1) && !isEmpty(resourceInfo.resourceVersions) ? 1 : 0;
    }


    /**
     * 处理合约变动
     * @param resourceInfo
     * @param policyInfo
     * @private
     */
    _policiesHandler(resourceInfo: ResourceInfo, policyInfo) {

        const {addPolicies, updatePolicies} = policyInfo
        const oldPolicyMap: Map<string, PolicyInfo> = new Map(resourceInfo.policies.map(x => [x.policyId, x]))

        if (!isEmpty(updatePolicies)) {
            for (let i = 0, j = updatePolicies.length; i < j; i++) {
                const item = updatePolicies[i];
                const targetPolicy = oldPolicyMap.get(item.policyId);
                if (!targetPolicy) {
                    throw new ApplicationError(this.ctx.gettext('params-validate-failed', 'policyId'), item);
                }
                targetPolicy.status = item.status;
                targetPolicy.policyName = item.policyName;
            }
        }

        if (!isEmpty(addPolicies)) {
            for (let i = 0, j = addPolicies.length; i < j; i++) {
                const item = addPolicies[i];
                const newPolicy = this.resourcePolicyCompiler.compilePolicyText(item.policyText, item.policyName);
                if (oldPolicyMap.has(newPolicy.policyId)) {
                    throw new ApplicationError(this.ctx.gettext('policy-create-duplicate-error'), item)
                }
                oldPolicyMap.set(newPolicy.policyId, newPolicy);
            }
        }

        return Array.from(oldPolicyMap.values());
    }
}