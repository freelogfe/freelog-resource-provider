'use strict'

const mime = require('mime')
const crypto = require('crypto')
const Patrun = require('patrun')
const fileCheckBase = require('./fileCheckBase')
const pbFileCheck = new (require('./implement/pb-file-check'))
const imageFileCheck = new (require('./implement/image-file-check'))
const resourceTypes = require('egg-freelog-base/app/enum/resource_type')

class FileGeneralCheck {

    constructor() {
        this.handlerPatrun = this._registerCheckHandler()
    }

    /**
     * 主入口
     * @param fileStream
     * @param resourceName
     * @param resourceType
     * @param meta
     * @param userId
     */
    main(ctx, {fileStream, resourceName, resourceType, meta, userId}) {

        const checkHandlerFn = this.handlerPatrun.find({resourceType})

        if (!checkHandlerFn) {
            return Promise.resolve({systemMeta: {}})
        }

        return checkHandlerFn(ctx, {fileStream, resourceName, resourceType, meta, userId})
    }

    /**
     * 注册检查者
     * @returns {*}
     * @private
     */
    _registerCheckHandler() {

        const patrun = Patrun()

        const checkBuild = (checkHandler, ctx, ...args) => {

            const task1 = this._getFileBaseInfo(...args)
            if (checkHandler && !(checkHandler instanceof fileCheckBase)) {
                throw new Error("checkHandler must be extends fileCheckBase")
            }
            const task2 = checkHandler ? checkHandler.check(ctx, ...args) : undefined
            return Promise.all([task1, task2]).then(([fileBaseInfo, checkInfo]) => {
                return {systemMeta: Object.assign({dependencies: []}, fileBaseInfo, checkInfo)}
            })
        }

        /**
         * 默认计算文件大小和sha1值
         */
        patrun.add({}, (...args) => checkBuild(null, ...args))

        /**
         * IMAGE检查处理者
         */
        patrun.add({resourceType: resourceTypes.IMAGE}, (...args) => checkBuild(imageFileCheck, ...args))

        /**
         * PB文件检测 (pb依赖改为了发行)
         */
        //patrun.add({resourceType: resourceTypes.PAGE_BUILD}, (...args) => checkBuild(pbFileCheck, ...args))


        return patrun
    }

    /**
     * 获取文件的sha1值以及文件大小
     * @param fileStream
     * @returns {Promise<any>}
     */
    _getFileBaseInfo({fileStream}) {

        let fileSize = 0
        const sha1sum = crypto.createHash('sha1')
        var mimeType = mime.getType(fileStream.filename)
        if (!mimeType) {
            mimeType = fileStream.mimeType
        }

        return new Promise((resolve, reject) => {
            fileStream.on('data', chunk => {
                sha1sum.update(chunk)
                fileSize += chunk.length
            }).on('end', () => resolve({
                sha1: sha1sum.digest('hex'), fileSize, mimeType
            })).on('error', reject)
        })
    }
}

module.exports = new FileGeneralCheck()