"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceController = void 0;
const midway_1 = require("midway");
const egg_freelog_base_1 = require("egg-freelog-base");
const vistorIdentityDecorator_1 = require("../../extend/vistorIdentityDecorator");
const lodash_1 = require("lodash");
const semver = require("semver");
const common_regex_1 = require("egg-freelog-base/app/extend/helper/common_regex");
let ResourceController = class ResourceController {
    async index(ctx) {
        const page = ctx.checkQuery('page').optional().default(1).gt(0).toInt().value;
        const pageSize = ctx.checkQuery('pageSize').optional().default(10).gt(0).lt(101).toInt().value;
        const resourceType = ctx.checkQuery('resourceType').optional().isResourceType().default('').toLow().value;
        const keywords = ctx.checkQuery('keywords').optional().decodeURIComponent().trim().value;
        const isSelf = ctx.checkQuery('isSelf').optional().default(0).toInt().in([0, 1]).value;
        const projection = ctx.checkQuery('projection').optional().toSplitArray().default([]).value;
        const status = ctx.checkQuery('status').optional().toInt().in([0, 1, 2]).value;
        const startResourceId = ctx.checkQuery('startResourceId').optional().isResourceId().value;
        const isLoadLatestVersionInfo = ctx.checkQuery('isLoadLatestVersionInfo').optional().toInt().in([0, 1]).value;
        ctx.validateParams();
        const condition = {};
        if (isSelf) {
            ctx.validateVisitorIdentity(egg_freelog_base_1.LoginUser);
            condition.userId = ctx.request.userId;
        }
        if (resourceType) {
            condition.resourceType = new RegExp(`^${resourceType}$`, 'i');
        }
        if (lodash_1.includes([0, 1], status)) {
            condition.status = status;
        }
        if (lodash_1.isString(keywords) && keywords.length > 0) {
            const searchRegExp = new RegExp(keywords, 'i');
            condition.$or = [{ resourceName: searchRegExp }, { resourceType: searchRegExp }];
        }
        if (!lodash_1.isUndefined(startResourceId)) {
            condition._id = { $lt: startResourceId };
        }
        let dataList = [];
        const totalItem = await this.resourceService.count(condition);
        if (totalItem <= (page - 1) * pageSize) {
            return ctx.success({ page, pageSize, totalItem, dataList });
        }
        dataList = await this.resourceService.findPageList(condition, page, pageSize, projection, { createDate: -1 });
        if (!isLoadLatestVersionInfo || !lodash_1.isEmpty(projection) && (!projection.includes('resourceId') || !projection.includes('latestVersion'))) {
            return ctx.success({ page, pageSize, totalItem, dataList });
        }
        const versionIds = dataList.filter(x => !lodash_1.isEmpty(x.latestVersion)).map(resourceInfo => {
            const versionId = this.resourcePropertyGenerator.generateResourceVersionId(resourceInfo.resourceId, resourceInfo.latestVersion);
            resourceInfo.latestVersionId = versionId;
            return versionId;
        });
        if (!lodash_1.isEmpty(versionIds)) {
            const versionInfos = await this.resourceVersionService.find({ versionId: { $in: versionIds } });
            dataList = dataList.map(item => {
                const latestVersionInfo = versionInfos.find(x => x.versionId === item.latestVersionId);
                item = item.toObject();
                item.latestVersionInfo = latestVersionInfo;
                return item;
            });
        }
        return ctx.success({ page, pageSize, totalItem, dataList });
    }
    /**
     * 创建资源,区别于旧版本,现在资源可以先创建,后添加版本.
     * 只有具有正式版本,且具有策略,才代表资源上架
     * @param ctx
     * @returns {Promise<void>}
     */
    async create(ctx) {
        const name = ctx.checkBody('name').exist().isResourceName().value;
        const resourceType = ctx.checkBody('resourceType').exist().isResourceType().value;
        const policies = ctx.checkBody('policies').optional().default([]).isArray().value;
        const intro = ctx.checkBody('intro').optional().type('string').default('').len(0, 1000).value;
        const coverImages = ctx.checkBody('coverImages').optional().isArray().len(0, 10).default([]).value;
        const tags = ctx.checkBody('tags').optional().isArray().len(0, 20).default([]).value;
        ctx.validateParams();
        if (coverImages.some(x => !ctx.app.validator.isURL(x.toString(), { protocols: ['https'] }))) {
            throw new egg_freelog_base_1.ArgumentError(ctx.gettext('params-format-validate-failed', 'coverImages'));
        }
        this._policySchemaValidate(policies);
        const { userId, username } = ctx.request.identityInfo.userInfo;
        const model = {
            userId, username, resourceType, name, intro, coverImages, policies, tags
        };
        await this.resourceService.findOneByResourceName(`${username}/${name}`, 'resourceName').then(resourceName => {
            if (resourceName) {
                throw new egg_freelog_base_1.ArgumentError('name is already existing');
            }
        });
        await this.resourceService.createResource(model).then(ctx.success);
    }
    async list(ctx) {
        const resourceIds = ctx.checkQuery('resourceIds').optional().isSplitMongoObjectId().toSplitArray().value;
        const resourceNames = ctx.checkQuery('resourceNames').optional().toSplitArray().value;
        const projection = ctx.checkQuery('projection').optional().toSplitArray().default([]).value;
        ctx.validateParams();
        if (!lodash_1.isEmpty(resourceIds)) {
            await this.resourceService.find({ _id: { $in: resourceIds } }, projection.join(' ')).then(ctx.success);
        }
        else if (!lodash_1.isEmpty(resourceNames)) {
            await this.resourceService.findByResourceNames(resourceNames, projection.join(' ')).then(ctx.success);
        }
        else {
            throw new egg_freelog_base_1.ArgumentError(ctx.gettext('params-required-validate-failed'));
        }
    }
    async update(ctx) {
        const resourceId = ctx.checkParams('resourceId').isResourceId().value;
        const updatePolicies = ctx.checkBody('updatePolicies').optional().isArray().value;
        const addPolicies = ctx.checkBody('addPolicies').optional().isArray().value;
        const intro = ctx.checkBody('intro').optional().type('string').len(0, 1000).value;
        const coverImages = ctx.checkBody('coverImages').optional().isArray().len(0, 10).value;
        const tags = ctx.checkBody('tags').optional().isArray().len(1, 20).value;
        ctx.validateParams();
        if ([updatePolicies, addPolicies, intro, coverImages, tags].every(lodash_1.isUndefined)) {
            throw new egg_freelog_base_1.ArgumentError(ctx.gettext('params-required-validate-failed'));
        }
        if (!lodash_1.isEmpty(coverImages) && coverImages.some(x => !ctx.app.validator.isURL(x.toString(), { protocols: ['https'] }))) {
            throw new egg_freelog_base_1.ArgumentError(ctx.gettext('params-format-validate-failed', 'previewImages'));
        }
        this._policySchemaValidate(addPolicies);
        this._policySchemaValidate(updatePolicies);
        const resourceInfo = await this.resourceService.findOne({ _id: resourceId });
        ctx.entityNullValueAndUserAuthorizationCheck(resourceInfo, { msg: ctx.gettext('params-validate-failed', 'resourceId') });
        const updateResourceOptions = {
            resourceId, intro, coverImages, tags, addPolicies, updatePolicies
        };
        await this.resourceService.updateResource(resourceInfo, updateResourceOptions).then(ctx.success);
    }
    async dependencyTree(ctx) {
        const resourceId = ctx.checkParams('resourceId').exist().isResourceId().value;
        const maxDeep = ctx.checkQuery('maxDeep').optional().isInt().toInt().ge(1).le(100).value;
        const version = ctx.checkQuery('version').optional().is(semver.valid, ctx.gettext('params-format-validate-failed', 'version')).value;
        const omitFields = ctx.checkQuery('omitFields').optional().toSplitArray().default([]).value;
        const isContainRootNode = ctx.checkQuery('isContainRootNode').optional().default(false).toBoolean().value;
        ctx.validateParams();
        const resourceInfo = await this.resourceService.findByResourceId(resourceId);
        ctx.entityNullObjectCheck(resourceInfo, {
            msg: ctx.gettext('params-validate-failed', 'resourceId'), data: { resourceId }
        });
        const { versionId } = this._getResourceVersionInfo(resourceInfo, version) || {};
        if (!versionId) {
            return ctx.success([]);
        }
        const versionInfo = await this.resourceVersionService.findOne({ versionId });
        await this.resourceService.getResourceDependencyTree(resourceInfo, versionInfo, {
            isContainRootNode, maxDeep, omitFields
        }).then(ctx.success);
    }
    async authTree(ctx) {
        const resourceId = ctx.checkParams('resourceId').exist().isResourceId().value;
        const version = ctx.checkQuery('version').optional().is(semver.valid, ctx.gettext('params-format-validate-failed', 'version')).value;
        ctx.validateParams();
        const resourceInfo = await this.resourceService.findByResourceId(resourceId);
        ctx.entityNullObjectCheck(resourceInfo, {
            msg: ctx.gettext('params-validate-failed', 'resourceId'), data: { resourceId }
        });
        const { versionId } = this._getResourceVersionInfo(resourceInfo, version) || {};
        if (!versionId) {
            return ctx.success([]);
        }
        const versionInfo = await this.resourceVersionService.findOne({ versionId });
        await this.resourceService.getResourceAuthTree(resourceInfo, versionInfo).then(ctx.success);
    }
    async show(ctx) {
        const resourceIdOrName = ctx.checkParams('resourceIdOrName').exist().decodeURIComponent().value;
        const isLoadLatestVersionInfo = ctx.checkQuery('isLoadLatestVersionInfo').optional().toInt().in([0, 1]).value;
        const projection = ctx.checkQuery('projection').optional().toSplitArray().default([]).value;
        ctx.validateParams();
        let resourceInfo = null;
        if (common_regex_1.mongoObjectId.test(resourceIdOrName)) {
            resourceInfo = await this.resourceService.findByResourceId(resourceIdOrName, projection.join(' '));
        }
        else if (common_regex_1.fullResourceName.test(resourceIdOrName)) {
            resourceInfo = await this.resourceService.findOneByResourceName(resourceIdOrName, projection.join(' '));
        }
        else {
            throw new egg_freelog_base_1.ArgumentError(ctx.gettext('params-format-validate-failed', 'resourceIdOrName'));
        }
        if (!resourceInfo) {
            return ctx.success(null);
        }
        resourceInfo = resourceInfo.toObject();
        if (isLoadLatestVersionInfo && resourceInfo.latestVersion) {
            const versionId = this.resourcePropertyGenerator.generateResourceVersionId(resourceInfo.resourceId, resourceInfo.latestVersion);
            resourceInfo.latestVersionInfo = await this.resourceVersionService.findOne({ versionId });
        }
        ctx.success(resourceInfo);
    }
    async contractCoverageVersions(ctx) {
        const resourceId = ctx.checkParams('resourceId').exist().isResourceId().value;
        const contractId = ctx.checkParams('contractId').exist().isContractId().value;
        ctx.validateParams();
        const condition = { resourceId, userId: ctx.userId, 'resolveResources.contracts.contractId': contractId };
        await this.resourceVersionService.find(condition, 'version versionId').then(ctx.success);
    }
    async ContractsCoverageVersions(ctx) {
        const resourceId = ctx.checkParams('resourceId').exist().isResourceId().value;
        const contractIds = ctx.checkQuery('contractIds').exist().isSplitMongoObjectId().toSplitArray().len(1, 200).value;
        ctx.validateParams();
        const condition = { resourceId, userId: ctx.userId, 'resolveResources.contracts.contractId': { $in: contractIds } };
        const contractMap = new Map(contractIds.map(x => [x, []]));
        const dataList = await this.resourceVersionService.find(condition, 'version versionId resolveResources.contracts.contractId');
        dataList.forEach(resourceVersion => resourceVersion.resolveResources.forEach(resolveResource => resolveResource.contracts.forEach(contract => {
            const list = contractMap.get(contract.contractId);
            if (list) {
                list.push(lodash_1.pick(resourceVersion, ['version', 'versionId']));
            }
        })));
        const result = [];
        for (let [key, value] of contractMap) {
            result.push({ contractId: key, versions: lodash_1.uniqBy(value, 'versionId') });
        }
        ctx.success(result);
    }
    /**
     * 获取资源版本信息
     * @param resourceInfo
     * @param version
     * @returns {Object}
     * @private
     */
    _getResourceVersionInfo(resourceInfo, version) {
        if (version && !resourceInfo.resourceVersions.some(x => x.version === version)) {
            throw new egg_freelog_base_1.ArgumentError(this.ctx.gettext('params-validate-failed', 'version'));
        }
        if (!version) {
            version = resourceInfo.latestVersion;
        }
        return resourceInfo.resourceVersions.find(x => x.version === semver.clean(version));
    }
    /**
     * 策略格式校验
     * @param policies
     * @private
     */
    _policySchemaValidate(policies) {
        const policyValidateResult = this.resourcePolicyValidator.validate(policies || []);
        if (!lodash_1.isEmpty(policyValidateResult.errors)) {
            throw new egg_freelog_base_1.ArgumentError(this.ctx.gettext('params-format-validate-failed', 'policies'), {
                errors: policyValidateResult.errors
            });
        }
    }
};
__decorate([
    midway_1.inject(),
    __metadata("design:type", Object)
], ResourceController.prototype, "ctx", void 0);
__decorate([
    midway_1.inject(),
    __metadata("design:type", Object)
], ResourceController.prototype, "resourcePropertyGenerator", void 0);
__decorate([
    midway_1.inject(),
    __metadata("design:type", Object)
], ResourceController.prototype, "resourceService", void 0);
__decorate([
    midway_1.inject(),
    __metadata("design:type", Object)
], ResourceController.prototype, "resourcePolicyValidator", void 0);
__decorate([
    midway_1.inject(),
    __metadata("design:type", Object)
], ResourceController.prototype, "resourceVersionService", void 0);
__decorate([
    midway_1.get('/'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ResourceController.prototype, "index", null);
__decorate([
    midway_1.post('/'),
    vistorIdentityDecorator_1.visitorIdentity(egg_freelog_base_1.LoginUser),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ResourceController.prototype, "create", null);
__decorate([
    midway_1.get('/list'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ResourceController.prototype, "list", null);
__decorate([
    midway_1.put('/:resourceId'),
    vistorIdentityDecorator_1.visitorIdentity(egg_freelog_base_1.LoginUser),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ResourceController.prototype, "update", null);
__decorate([
    midway_1.get('/:resourceId/dependencyTree'),
    vistorIdentityDecorator_1.visitorIdentity(egg_freelog_base_1.LoginUser | egg_freelog_base_1.InternalClient),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ResourceController.prototype, "dependencyTree", null);
__decorate([
    midway_1.get('/:resourceId/authTree'),
    vistorIdentityDecorator_1.visitorIdentity(egg_freelog_base_1.LoginUser | egg_freelog_base_1.InternalClient),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ResourceController.prototype, "authTree", null);
__decorate([
    midway_1.get('/:resourceIdOrName'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ResourceController.prototype, "show", null);
__decorate([
    midway_1.get('/:resourceId/contracts/:contractId/coverageVersions'),
    vistorIdentityDecorator_1.visitorIdentity(egg_freelog_base_1.LoginUser),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ResourceController.prototype, "contractCoverageVersions", null);
__decorate([
    midway_1.get('/:resourceId/contracts/coverageVersions'),
    vistorIdentityDecorator_1.visitorIdentity(egg_freelog_base_1.LoginUser),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ResourceController.prototype, "ContractsCoverageVersions", null);
ResourceController = __decorate([
    midway_1.provide(),
    midway_1.controller('/v2/resources')
], ResourceController);
exports.ResourceController = ResourceController;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb3VyY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvYXBwL2NvbnRyb2xsZXIvcmVzb3VyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUEsbUNBQW1FO0FBQ25FLHVEQUEwRTtBQUMxRSxrRkFBcUU7QUFFckUsbUNBQThFO0FBQzlFLGlDQUFpQztBQUNqQyxrRkFBZ0c7QUFJaEcsSUFBYSxrQkFBa0IsR0FBL0IsTUFBYSxrQkFBa0I7SUFjM0IsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHO1FBQ1gsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQztRQUM5RSxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQztRQUMvRixNQUFNLFlBQVksR0FBRyxHQUFHLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLGNBQWMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7UUFDMUcsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLEtBQUssQ0FBQztRQUN6RixNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxD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