'use strict'

module.exports = app => {

    const mongoose = app.mongoose;

    const toObjectOptions = {
        transform: function (doc, ret, options) {
            return {
                authSchemeId: ret._id.toString(),
                authSchemeName: ret.authSchemeName,
                resourceId: ret.resourceId,
                dependCount: ret.dependCount,
                statementState: ret.statementState,
                policy: ret.policy,
                policyText: ret.policyText,
                languageType: ret.languageType,
                bubbleResourceIds: ret.bubbleResourceIds,
                dutyStatements: ret.dutyStatements,
                statementCoverageRate: ret.statementCoverageRate,
                contractCoverageRate: ret.contractCoverageRate,
                userId: ret.userId,
                serialNumber: ret.userId,
                status: ret.status
            }
        }
    }

    const statementAuthSchemeSchema = new mongoose.Schema({
        resourceId: {type: String, required: true},
        authSchemeId: {type: String, required: true},
        policySegmentId: {type: String, required: true},
    }, {_id: false})

    const AuthSchemeSchema = new mongoose.Schema({
        authSchemeName: {type: String, required: true},
        resourceId: {type: String, required: true},
        dependCount: {type: Number, required: true}, //资源引用总数量
        statementState: {type: Number, default: 1, required: true}, //授权点类型 1:全部上抛(默认)  2:全包含  3:部分上抛
        policy: {type: Array, default: []}, //引用策略段
        policyText: {type: String, default: ''}, //引用策略描述语言原文
        languageType: {type: String, default: 'freelog_policy', required: true},
        bubbleResourceIds: {type: [String], default: []}, //授权点上抛的资源(冒泡给上层)
        dutyStatements: [statementAuthSchemeSchema], //声明解决的资源
        statementCoverageRate: {type: Number, default: 0, min: 0, max: 100}, //授权依赖声明覆盖率
        contractCoverageRate: {type: Number, default: 0, min: 0, max: 100}, //指定执行合约覆盖率
        userId: {type: Number, required: true},
        serialNumber: {type: String, required: true}, //序列号,用于校验前端与后端是否一致
        status: {type: Number, default: 0, required: true}, // 0:初始状态 1:已发布  2:已下架
    }, {
        versionKey: false,
        timestamps: {createdAt: 'createDate', updatedAt: 'updateDate'},
        toJSON: toObjectOptions,
        toObject: toObjectOptions
    })

    AuthSchemeSchema.index({resourceId: 1, userId: 1, status: 1});

    return mongoose.model('auth-scheme', AuthSchemeSchema)
}