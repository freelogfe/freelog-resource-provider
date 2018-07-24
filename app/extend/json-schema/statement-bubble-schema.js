'use strict'

const FreelogCommonJsonSchema = require('./freelog-common-json-schema')

class DutyStatementsSchemaValidator extends FreelogCommonJsonSchema {

    constructor() {
        super()
        this.__initial__()
    }

    /**
     * 责任声明主题校验
     * @returns {ActiveX.ISchema}
     */
    get dutyStatementsValidator() {
        return super.getSchema('/statementArraySchema')
    }

    /**
     * 显示上抛主题校验
     * @returns {ActiveX.ISchema}
     */
    get bubbleResourcesValidator() {
        return super.getSchema('/bubbleResourceArraySchema')
    }


    /**
     * 初始化函数
     * @private
     */
    __initial__() {
        this.__registerValidators__()
    }

    /**
     * 注册所有的校验
     * @private
     */
    __registerValidators__() {

        super.addSchema({
            id: "/statementSchema",
            type: "object",
            additionalProperties: false,
            properties: {
                resourceId: {type: "string", format: 'resourceId'},
                authSchemeId: {type: "string", format: 'mongoObjectId'},
                policySegmentId: {type: "string", format: 'md5'}
            }
        })

        super.addSchema({
            id: "/statementArraySchema",
            type: "array",
            uniqueItems: true,
            items: {$ref: "/statementSchema"}
        })

        super.addSchema({
            id: "/bubbleResourceSchema",
            type: "object",
            additionalProperties: false,
            properties: {
                resourceId: {type: "string", format: 'resourceId'}
            }
        })

        super.addSchema({
            id: "/bubbleResourceArraySchema",
            type: "array",
            uniqueItems: true,
            items: {$ref: "/bubbleResourceSchema"}
        })
    }
}

module.exports = new DutyStatementsSchemaValidator()
