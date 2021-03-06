/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/
'use strict';
import * as vscode from 'vscode';
import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as path from 'path';
import Axios from 'axios';
import { TestUtil } from '../TestUtil';
import { VSCodeBlockchainOutputAdapter } from '../../extension/logging/VSCodeBlockchainOutputAdapter';
import { ExtensionCommands } from '../../ExtensionCommands';
import { Reporter } from '../../extension/util/Reporter';
import { FabricEnvironmentRegistry, FabricEnvironmentRegistryEntry, LogType, EnvironmentType, FabricEnvironment, FabricRuntimeUtil } from 'ibm-blockchain-platform-common';
import { LocalEnvironment } from '../../extension/fabric/environments/LocalEnvironment';
import { LocalEnvironmentManager } from '../../extension/fabric/environments/LocalEnvironmentManager';
import { UserInputUtil} from '../../extension/commands/UserInputUtil';
import { ModuleUtil } from '../../extension/util/ModuleUtil';
import { SettingConfigurations } from '../../configurations';
import { ExtensionUtil } from '../../extension/util/ExtensionUtil';

// tslint:disable no-unused-expression
chai.should();
chai.use(sinonChai);

describe('AddEnvironmentCommand', () => {
    let mySandBox: sinon.SinonSandbox;
    let logSpy: sinon.SinonSpy;
    let showInputBoxStub: sinon.SinonStub;
    let chooseNameStub: sinon.SinonStub;
    let executeCommandStub: sinon.SinonStub;
    let sendTelemetryEventStub: sinon.SinonStub;
    let showQuickPickItemStub: sinon.SinonStub;
    let deleteEnvironmentSpy: sinon.SinonSpy;
    let openFileBrowserStub: sinon.SinonStub;
    let environmentDirectoryPath: string;
    let axiosGetStub: sinon.SinonStub;
    let chooseCertVerificationStub: sinon.SinonStub;
    let setPasswordStub: sinon.SinonStub;
    let getCoreNodeModuleStub: sinon.SinonStub;
    let getNodesStub: sinon.SinonStub;
    let url: string;
    let key: string;
    let secret: string;
    let certVerificationError: any;
    let certVerificationError2: any;
    let chooseMethodStub: sinon.SinonStub;
    let getExtensionLocalFabricSettingStub: sinon.SinonStub;

    before(async () => {
        mySandBox = sinon.createSandbox();
        await TestUtil.setupTests(mySandBox);
    });

    describe('addEnvironment', () => {

        beforeEach(async () => {
            try {
                const localEnvironment: LocalEnvironment = LocalEnvironmentManager.instance().getRuntime(FabricRuntimeUtil.LOCAL_FABRIC);
                if (localEnvironment) {
                    await localEnvironment.teardown();
                }
            } catch (err) {
                //
            }

            await FabricEnvironmentRegistry.instance().clear();
            logSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
            showQuickPickItemStub = mySandBox.stub(UserInputUtil, 'showQuickPickItem');
            chooseMethodStub = showQuickPickItemStub.withArgs('Select a method to add an environment');
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES});
            environmentDirectoryPath = path.join(__dirname, '..', '..', '..', 'test', 'data', 'managedAnsible');
            const uri: vscode.Uri = vscode.Uri.file(environmentDirectoryPath);
            openFileBrowserStub = mySandBox.stub(UserInputUtil, 'openFileBrowser').resolves(uri);
            showInputBoxStub = mySandBox.stub(UserInputUtil, 'showInputBox');
            chooseNameStub = showInputBoxStub.withArgs('Enter a name for the environment');
            chooseNameStub.resolves('myEnvironment');
            executeCommandStub = mySandBox.stub(vscode.commands, 'executeCommand').callThrough();
            executeCommandStub.withArgs(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT).resolves(true);
            executeCommandStub.withArgs(ExtensionCommands.EDIT_NODE_FILTERS).resolves(true);
            executeCommandStub.withArgs(ExtensionCommands.REFRESH_ENVIRONMENTS).resolves();
            executeCommandStub.withArgs(ExtensionCommands.REFRESH_GATEWAYS).resolves();
            executeCommandStub.withArgs(ExtensionCommands.REFRESH_WALLETS).resolves();
            sendTelemetryEventStub = mySandBox.stub(Reporter.instance(), 'sendTelemetryEvent');
            deleteEnvironmentSpy = mySandBox.spy(FabricEnvironmentRegistry.instance(), 'delete');

            // Ops tools requirements
            axiosGetStub = mySandBox.stub(Axios, 'get');

            url = 'my/OpsTool/url';
            key = 'myOpsToolKey';
            secret = 'myOpsToolSecret';
            showInputBoxStub.withArgs('Enter the URL of the IBM Blockchain Platform Console you want to connect to').resolves(url);
            showInputBoxStub.withArgs('Enter the API key of the IBM Blockchain Platform Console you want to connect to').resolves(key);
            showInputBoxStub.withArgs('Enter the API secret of the IBM Blockchain Platform Console you want to connect to').resolves(secret);
            chooseCertVerificationStub = showQuickPickItemStub.withArgs('Unable to perform certificate verification. Please choose how to proceed', [{ label: UserInputUtil.CONNECT_NO_CA_CERT_CHAIN, data: UserInputUtil.CONNECT_NO_CA_CERT_CHAIN }, { label: UserInputUtil.CANCEL_NO_CERT_CHAIN, data: UserInputUtil.CANCEL_NO_CERT_CHAIN, description: UserInputUtil.CANCEL_NO_CERT_CHAIN_DESCRIPTION }]);
            chooseCertVerificationStub.resolves({ label: UserInputUtil.CONNECT_NO_CA_CERT_CHAIN, data: UserInputUtil.CONNECT_NO_CA_CERT_CHAIN });
            certVerificationError = new Error('Certificate Verification Error');
            certVerificationError.code = 'SOME_CODE';
            certVerificationError2 = new Error('Certificate Verification Error');
            certVerificationError2.response = {status: 401};
            axiosGetStub.onFirstCall().rejects(certVerificationError);
            axiosGetStub.onSecondCall().rejects(certVerificationError2);
            axiosGetStub.onThirdCall().resolves();
            setPasswordStub = mySandBox.stub().resolves();
            getCoreNodeModuleStub = mySandBox.stub(ModuleUtil, 'getCoreNodeModule').returns({setPassword: setPasswordStub});
            getNodesStub = mySandBox.stub(FabricEnvironment.prototype, 'getNodes');
            getNodesStub.resolves([{nodeOneData: {}}, {nodeTwoData: {}}]);
            getExtensionLocalFabricSettingStub = mySandBox.stub(ExtensionUtil, 'getExtensionLocalFabricSetting');
            getExtensionLocalFabricSettingStub.returns(true);
        });

        afterEach(async () => {
            mySandBox.restore();
        });

        it('should test an Ops Tools environment can be added', async () => {

            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();

            environments.length.should.equal(1);
            environments[0].should.deep.equal({
                name: 'myOpsToolsEnvironment',
                url: url,
                environmentType: EnvironmentType.OPS_TOOLS_ENVIRONMENT
            });

            deleteEnvironmentSpy.should.have.not.been.called;
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.EDIT_NODE_FILTERS, sinon.match.instanceOf(FabricEnvironmentRegistryEntry), true, UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('addEnvironmentCommand');
        });

        it('should test adding a environment can be cancelled when choosing the method of adding environment', async () => {
            chooseMethodStub.resolves(undefined);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();
            environments.length.should.equal(0);
            showInputBoxStub.should.not.have.been.called;
            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'Add environment');
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should test an environment can be added', async () => {
            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();

            environments.length.should.equal(1);
            environments[0].should.deep.equal({
                name: 'myEnvironment'
            });

            executeCommandStub.should.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry), true, UserInputUtil.ADD_ENVIRONMENT_FROM_NODES);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);

            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('addEnvironmentCommand');
        });

        it('should test multiple environments can be added', async () => {
            chooseNameStub.onFirstCall().resolves('myEnvironmentOne');

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            chooseNameStub.reset();
            chooseNameStub.onFirstCall().resolves('myEnvironmentTwo');

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();

            environments.length.should.equal(2);
            environments[0].should.deep.equal({
                name: 'myEnvironmentOne'
            });

            environments[1].should.deep.equal({
                name: 'myEnvironmentTwo'
            });

            executeCommandStub.should.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry), true, UserInputUtil.ADD_ENVIRONMENT_FROM_NODES);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);
            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(3).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
            sendTelemetryEventStub.should.have.been.calledTwice;
            sendTelemetryEventStub.should.have.been.calledWithExactly('addEnvironmentCommand');
        });

        it('should handle cancel when choosing a method', async () => {
            chooseMethodStub.resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            await FabricEnvironmentRegistry.instance().exists('myEnvironment').should.eventually.equal(false);

            logSpy.callCount.should.equal(1);
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            sendTelemetryEventStub.should.not.have.been.calledOnceWithExactly('addEnvironmentCommand');
        });

        it('should test adding a environment can be cancelled when giving a environment name', async () => {
            chooseNameStub.onFirstCall().resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();
            environments.length.should.equal(0);
            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'Add environment');
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should handle errors when adding nodes to an environment', async () => {
            const error: Error = new Error('some error');
            executeCommandStub.withArgs(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT).rejects(error);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();
            environments.length.should.equal(0);
            logSpy.should.have.been.calledTwice;
            deleteEnvironmentSpy.should.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Failed to add a new environment: ${error.message}`, `Failed to add a new environment: ${error.toString()}`);
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should handle errors when adding nodes to an Ops Tools environment', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');
            const error: Error = new Error('some error');
            executeCommandStub.withArgs(ExtensionCommands.EDIT_NODE_FILTERS).rejects(error);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();
            environments.length.should.equal(0);
            logSpy.should.have.been.calledTwice;
            deleteEnvironmentSpy.should.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Failed to add a new environment: ${error.message}`, `Failed to add a new environment: ${error.toString()}`);
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should error if a environment with the same name already exists', async () => {
            const error: Error = new Error('An environment with this name already exists or is too similar.');
            chooseNameStub.resolves('myEnvironmentOne');

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();
            environments.length.should.equal(1);
            environments[0].should.deep.equal({
                name: 'myEnvironmentOne'
            });

            executeCommandStub.should.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry));
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);

            deleteEnvironmentSpy.should.not.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(3).should.have.been.calledWith(LogType.ERROR, `Failed to add a new environment: ${error.message}`, `Failed to add a new environment: ${error.toString()}`);
            sendTelemetryEventStub.should.have.been.calledOnce;
        });

        it('should error if a environment with the same docker name already exists', async () => {
            const error: Error = new Error('An environment with this name already exists or is too similar.');
            chooseNameStub.onCall(0).resolves('myEnvironmentOne');
            chooseNameStub.onCall(1).resolves('my-Environment-One');
            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();
            environments.length.should.equal(1);
            environments[0].should.deep.equal({
                name: 'myEnvironmentOne'
            });

            executeCommandStub.should.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry));
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);

            deleteEnvironmentSpy.should.not.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(3).should.have.been.calledWith(LogType.ERROR, `Failed to add a new environment: ${error.message}`, `Failed to add a new environment: ${error.toString()}`);
            sendTelemetryEventStub.should.have.been.calledOnce;
        });

        it('should add environment but warn if nodes are not valid', async () => {
            executeCommandStub.withArgs(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT).resolves(false);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();
            environments.length.should.equal(1);
            environments[0].should.deep.equal({
                name: 'myEnvironment'
            });

            executeCommandStub.should.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry), true, UserInputUtil.ADD_ENVIRONMENT_FROM_NODES);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);

            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.should.have.been.calledWith(LogType.WARNING, 'Added a new environment, but some nodes could not be added');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('addEnvironmentCommand');
        });

        it('should cancel environment creation if no nodes have been added', async () => {
            executeCommandStub.withArgs(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT).resolves(undefined);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();
            environments.length.should.equal(0);
            deleteEnvironmentSpy.should.have.been.called;
            logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'Add environment');
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should add a managed environment from an ansible dir', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR});

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();

            environments.length.should.equal(1);
            environments[0].should.deep.equal({
                name: 'myEnvironment',
                environmentDirectory: environmentDirectoryPath,
                managedRuntime: true,
                environmentType: EnvironmentType.ANSIBLE_ENVIRONMENT
            });

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry));
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_WALLETS);

            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('addEnvironmentCommand');
        });

        it('should add a non managed environment from an ansible dir', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR});

            environmentDirectoryPath = path.join(environmentDirectoryPath, '..', 'nonManagedAnsible');
            const uri: vscode.Uri = vscode.Uri.file(environmentDirectoryPath);

            openFileBrowserStub.resolves(uri);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();

            environments.length.should.equal(1);
            environments[0].should.deep.equal({
                name: 'myEnvironment',
                environmentDirectory: environmentDirectoryPath,
                environmentType: EnvironmentType.ANSIBLE_ENVIRONMENT
            });

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry));
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_WALLETS);

            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('addEnvironmentCommand');
        });

        it('should handle cancel from choosing dir when adding from an ansible dir', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR});

            openFileBrowserStub.resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            await FabricEnvironmentRegistry.instance().exists('myEnvironment').should.eventually.equal(false);

            logSpy.callCount.should.equal(1);
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            sendTelemetryEventStub.should.not.have.been.calledOnceWithExactly('addEnvironmentCommand');
        });

        it('should handle user cancelling when asked for url when creating an OpsTool instance', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');
            showInputBoxStub.withArgs('Enter the URL of the IBM Blockchain Platform Console you want to connect to').resolves(undefined);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();
            environments.length.should.equal(0);
            showInputBoxStub.withArgs('Enter the API key of the IBM Blockchain Platform Console you want to connect to').should.not.have.been.called;
            showInputBoxStub.withArgs('Enter the API secret of the IBM Blockchain Platform Console you want to connect to').should.not.have.been.called;
            axiosGetStub.should.not.have.been.called;
            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'Add environment');
        });

        it('should handle user cancelling when asked for api key when creating an OpsTool instance', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');
            showInputBoxStub.withArgs('Enter the API key of the IBM Blockchain Platform Console you want to connect to').resolves(undefined);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();
            environments.length.should.equal(0);
            showInputBoxStub.withArgs('Enter the API secret of the IBM Blockchain Platform Console you want to connect to').should.not.have.been.called;
            axiosGetStub.should.not.have.been.called;
            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'Add environment');
        });

        it('should handle when user cancels when asked for api secret when creating an OpsTool instance', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');
            showInputBoxStub.withArgs('Enter the API secret of the IBM Blockchain Platform Console you want to connect to').resolves(undefined);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();
            environments.length.should.equal(0);
            axiosGetStub.should.not.have.been.called;
            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'Add environment');
        });

        it('should handle when the keytar module cannot be imported at all when creating a new OpsTool instance', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');
            getCoreNodeModuleStub.withArgs('keytar').returns(undefined);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();
            environments.length.should.equal(0);

            getCoreNodeModuleStub.should.have.been.calledOnce;
            deleteEnvironmentSpy.should.not.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Failed to add a new environment: Error importing the keytar module`, `Failed to add a new environment: Error: Error importing the keytar module`);
        });

        it('should handle when certificate is present in OS trust store when creating new OpsTool instance', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');
            axiosGetStub.onFirstCall().rejects(certVerificationError2);
            axiosGetStub.onSecondCall().resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            getCoreNodeModuleStub.should.have.been.calledOnce;
            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
        });

        it('should handle when the api key or secret are incorrect when creating new OpsTool instance', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');
            const error: Error = new Error('invalid credentials error');
            axiosGetStub.onThirdCall().rejects(error);
            const thrownError: Error = new Error(`Problem detected with API key and/or secret: ${error.message}`);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            getCoreNodeModuleStub.should.have.been.calledOnce;
            deleteEnvironmentSpy.should.not.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Failed to add a new environment: ${thrownError.message}`, `Failed to add a new environment: ${thrownError.toString()}`);
        });

        it('should handle when the api key, api secret and rejectUnauthorized cannot be stored saved securely onto the keychain using the setPassword function when creating new OpsTool instance', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');
            const error: Error = new Error('newError');
            const caughtError: Error = new Error(`Unable to store the required credentials: ${error.message}`);
            setPasswordStub.throws(error);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            getCoreNodeModuleStub.should.have.been.calledOnce;
            deleteEnvironmentSpy.should.not.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Failed to add a new environment: ${caughtError.message}`, `Failed to add a new environment: ${caughtError.toString()}`);
        });

        it('should handle user choosing not to perform certificate verification on a new Ops Tool instance', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');
            chooseCertVerificationStub.onFirstCall().resolves(UserInputUtil.CONNECT_NO_CA_CERT_CHAIN);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
        });

        it('should handle when user cancels when asked to choose certificate verification methtod when creating an OpsTool instance', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');
            chooseCertVerificationStub.resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            axiosGetStub.should.have.have.been.calledTwice;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
        });

        it('should handle error connecting to Ops Tool health end point URL when adding environment', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');
            const error: Error = new Error('some error');
            const error2: Error = new Error('second error');
            axiosGetStub.onFirstCall().rejects(error);
            axiosGetStub.onSecondCall().rejects(error2);
            const thrownError: Error = new Error(`Unable to connect to the IBM Blockchain Platform network: ${error2.message}`);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            getCoreNodeModuleStub.should.have.been.calledOnce;
            deleteEnvironmentSpy.should.not.have.been.called;
            axiosGetStub.should.have.have.been.calledTwice;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Failed to add a new environment: ${thrownError.message}`, `Failed to add a new environment: ${thrownError.toString()}`);

        });

        it('should create environment without nodes if user does not choose any nodes from a new Ops Tool instance', async () => {
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS});
            chooseNameStub.onFirstCall().resolves('myOpsToolsEnvironment');
            executeCommandStub.withArgs(ExtensionCommands.EDIT_NODE_FILTERS).resolves(true);
            getNodesStub.onFirstCall().resolves([]);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment. No nodes included in current filters, click myOpsToolsEnvironment to edit filters');
        });

        it(`shouldn't have option to create from template if local fabric functionality is disabled`, async () => {
            getExtensionLocalFabricSettingStub.returns(false);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const environments: Array<FabricEnvironmentRegistryEntry> = await FabricEnvironmentRegistry.instance().getAll();

            environments.length.should.equal(1);
            environments[0].should.deep.equal({
                name: 'myEnvironment'
            });

            executeCommandStub.should.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry), true, UserInputUtil.ADD_ENVIRONMENT_FROM_NODES);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);

            deleteEnvironmentSpy.should.have.not.been.called;
            showQuickPickItemStub.should.have.been.calledWith('Select a method to add an environment', [{ label: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, data: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, description: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, description: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, data: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, description: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES_DESCRIPTION }]);
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('addEnvironmentCommand');
        });

        it('should be able to add a new 1-org local network', async () => {
            getNodesStub.restore();

            const envName: string = 'New 1 Org Network';
            chooseMethodStub.onCall(0).resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE});
            showQuickPickItemStub.onCall(1).resolves({data: 1});

            chooseNameStub.resolves(envName);
            const initializeStub: sinon.SinonStub = mySandBox.stub(LocalEnvironmentManager.instance(), 'initialize').resolves();

            const mockRuntime: sinon.SinonStubbedInstance<LocalEnvironment> = mySandBox.createStubInstance(LocalEnvironment);
            mockRuntime.getName.returns(envName);
            mockRuntime.generate.resolves();

            const getRuntimeStub: sinon.SinonStub = mySandBox.stub(LocalEnvironmentManager.instance(), 'getRuntime').returns(mockRuntime);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            showQuickPickItemStub.should.have.been.calledTwice;
            chooseMethodStub.should.have.been.calledOnceWithExactly('Select a method to add an environment', [{label: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE, data: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE, description: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE_DESCRIPTION}, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, data: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, description: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, description: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, data: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, description: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES_DESCRIPTION }]);
            showQuickPickItemStub.should.have.been.calledWith('Choose a configuration for a new local network', [{label: UserInputUtil.ONE_ORG_TEMPLATE, data: 1}, {label: UserInputUtil.TWO_ORG_TEMPLATE, data: 2}]);
            chooseNameStub.should.have.been.calledOnceWithExactly(`Enter a name for the environment`);
            initializeStub.should.have.been.calledWith(envName, 1);
            getRuntimeStub.should.have.been.calledOnceWith(envName);
            mockRuntime.generate.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry));

            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('addEnvironmentCommand');
        });

        it('should be able to add a new 2-org local network', async () => {
            getNodesStub.restore();

            const envName: string = 'New 2 Org Network';
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE});
            showQuickPickItemStub.resolves({data: 2});

            chooseNameStub.resolves(envName);
            const initializeStub: sinon.SinonStub = mySandBox.stub(LocalEnvironmentManager.instance(), 'initialize').resolves();

            const mockRuntime: sinon.SinonStubbedInstance<LocalEnvironment> = mySandBox.createStubInstance(LocalEnvironment);
            mockRuntime.getName.returns(envName);
            mockRuntime.generate.resolves();

            const getRuntimeStub: sinon.SinonStub = mySandBox.stub(LocalEnvironmentManager.instance(), 'getRuntime').returns(mockRuntime);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            chooseMethodStub.should.have.been.calledWithExactly('Select a method to add an environment', [{label: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE, data: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE, description: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE_DESCRIPTION}, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, data: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, description: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, description: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, data: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, description: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES_DESCRIPTION }]);
            showQuickPickItemStub.should.have.been.calledWithExactly('Choose a configuration for a new local network', [{label: UserInputUtil.ONE_ORG_TEMPLATE, data: 1}, {label: UserInputUtil.TWO_ORG_TEMPLATE, data: 2}]);

            showInputBoxStub.should.have.been.calledOnceWithExactly(`Enter a name for the environment`);
            initializeStub.should.have.been.calledWith(envName, 2);
            getRuntimeStub.should.have.been.calledOnceWith(envName);
            mockRuntime.generate.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry));

            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('addEnvironmentCommand');
        });

        it('should return when cancelling selecting a network configuration', async () => {

            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE});
            showQuickPickItemStub.resolves();

            const initializeSpy: sinon.SinonSpy = mySandBox.spy(LocalEnvironmentManager.instance(), 'initialize');

            const getRuntimeSpy: sinon.SinonSpy = mySandBox.spy(LocalEnvironmentManager.instance(), 'getRuntime');

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            chooseMethodStub.should.have.been.calledWithExactly('Select a method to add an environment', [{label: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE, data: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE, description: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE_DESCRIPTION}, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, data: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, description: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, description: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, data: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, description: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES_DESCRIPTION }]);
            showQuickPickItemStub.should.have.been.calledWithExactly('Choose a configuration for a new local network', [{label: UserInputUtil.ONE_ORG_TEMPLATE, data: 1}, {label: UserInputUtil.TWO_ORG_TEMPLATE, data: 2}]);

            showInputBoxStub.should.not.have.been.calledOnceWithExactly(`Enter a name for the environment`);
            initializeSpy.should.not.have.been.called;
            getRuntimeSpy.should.not.have.been.called;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry));

            deleteEnvironmentSpy.should.have.not.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.should.not.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
            sendTelemetryEventStub.should.not.have.been.calledOnceWithExactly('addEnvironmentCommand');
        });

        it('should delete setting and handle any errors when creating a new 1-org local network', async () => {
            getNodesStub.restore();

            await vscode.workspace.getConfiguration().update(SettingConfigurations.FABRIC_RUNTIME, {
                'Failing Network': {
                    port: {
                        startPort: 1,
                        endPort: 2
                    }
                },
                'Other Network': {
                    ports: {
                        startPort: 3,
                        endPort: 4
                    }
                }
            }, vscode.ConfigurationTarget.Global);

            const envName: string = 'Failing Network';
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE});
            showQuickPickItemStub.resolves({data: 1});

            chooseNameStub.resolves(envName);
            const initializeStub: sinon.SinonStub = mySandBox.stub(LocalEnvironmentManager.instance(), 'initialize').resolves();

            const mockRuntime: sinon.SinonStubbedInstance<LocalEnvironment> = mySandBox.createStubInstance(LocalEnvironment);
            mockRuntime.getName.returns(envName);

            const error: Error = new Error(`unable to create new environment`);
            mockRuntime.generate.throws(error);

            const getRuntimeStub: sinon.SinonStub = mySandBox.stub(LocalEnvironmentManager.instance(), 'getRuntime').returns(mockRuntime);

            executeCommandStub.withArgs(ExtensionCommands.TEARDOWN_FABRIC, undefined, true, envName).resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const runtimeSetting: any = await vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_RUNTIME, vscode.ConfigurationTarget.Global);
            runtimeSetting.should.deep.equal({
                'Other Network': {
                    ports: {
                        startPort: 3,
                        endPort: 4
                    }
                }
            });

            chooseMethodStub.should.have.been.calledWithExactly('Select a method to add an environment', [{label: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE, data: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE, description: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE_DESCRIPTION}, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, data: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, description: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, description: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, data: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, description: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES_DESCRIPTION }]);
            showQuickPickItemStub.should.have.been.calledWithExactly('Choose a configuration for a new local network', [{label: UserInputUtil.ONE_ORG_TEMPLATE, data: 1}, {label: UserInputUtil.TWO_ORG_TEMPLATE, data: 2}]);
            chooseNameStub.should.have.been.calledOnceWithExactly(`Enter a name for the environment`);
            initializeStub.should.have.been.calledWith(envName, 1);
            getRuntimeStub.should.have.been.calledOnceWith(envName);
            mockRuntime.generate.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry));

            deleteEnvironmentSpy.should.been.calledOnceWithExactly(envName, true);
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Failed to add a new environment: ${error.message}`, `Failed to add a new environment: ${error.toString()}`);
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should not setting and handle any errors when creating a new 1-org local network', async () => {
            getNodesStub.restore();

            await vscode.workspace.getConfiguration().update(SettingConfigurations.FABRIC_RUNTIME, {
                'Other Network': {
                    ports: {
                        startPort: 3,
                        endPort: 4
                    }
                }
            }, vscode.ConfigurationTarget.Global);

            const envName: string = 'Failing Network';
            chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE});
            showQuickPickItemStub.resolves({data: 1});

            chooseNameStub.resolves(envName);
            const initializeStub: sinon.SinonStub = mySandBox.stub(LocalEnvironmentManager.instance(), 'initialize').resolves();

            const mockRuntime: sinon.SinonStubbedInstance<LocalEnvironment> = mySandBox.createStubInstance(LocalEnvironment);
            mockRuntime.getName.returns(envName);

            const error: Error = new Error(`unable to create new environment`);
            mockRuntime.generate.throws(error);

            const getRuntimeStub: sinon.SinonStub = mySandBox.stub(LocalEnvironmentManager.instance(), 'getRuntime').returns(mockRuntime);

            executeCommandStub.withArgs(ExtensionCommands.TEARDOWN_FABRIC, undefined, true, envName).resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

            const runtimeSetting: any = await vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_RUNTIME, vscode.ConfigurationTarget.Global);
            runtimeSetting.should.deep.equal({
                'Other Network': {
                    ports: {
                        startPort: 3,
                        endPort: 4
                    }
                }
            });

            chooseMethodStub.should.have.been.calledWithExactly('Select a method to add an environment', [{label: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE, data: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE, description: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE_DESCRIPTION}, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, data: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, description: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, description: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, data: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, description: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES_DESCRIPTION }]);
            showQuickPickItemStub.should.have.been.calledWithExactly('Choose a configuration for a new local network', [{label: UserInputUtil.ONE_ORG_TEMPLATE, data: 1}, {label: UserInputUtil.TWO_ORG_TEMPLATE, data: 2}]);
            chooseNameStub.should.have.been.calledOnceWithExactly(`Enter a name for the environment`);
            initializeStub.should.have.been.calledWith(envName, 1);
            getRuntimeStub.should.have.been.calledOnceWith(envName);
            mockRuntime.generate.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry));

            deleteEnvironmentSpy.should.been.calledOnceWithExactly(envName, true);
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Failed to add a new environment: ${error.message}`, `Failed to add a new environment: ${error.toString()}`);
            sendTelemetryEventStub.should.not.have.been.called;
        });

        // TODO: Add this back in when the tutorial is created
        // it('should open tutorial if user wants to learn about creating additional networks', async () => {
        //     getNodesStub.restore();
        //     chooseMethodStub.resolves({data: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE});
        //     showQuickPickItemStub.resolves({data: UserInputUtil.CREATE_ADDITIONAL_LOCAL_NETWORKS});

        //     const initializeSpy: sinon.SinonSpy = mySandBox.spy(LocalEnvironmentManager.instance(), 'initialize');

        //     const getRuntimeSpy: sinon.SinonSpy = mySandBox.spy(LocalEnvironmentManager.instance(), 'getRuntime');

        //     await vscode.commands.executeCommand(ExtensionCommands.ADD_ENVIRONMENT);

        //     chooseMethodStub.should.have.been.calledWithExactly('Select a method to add an environment', [{label: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE, data: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE, description: UserInputUtil.ADD_ENVIRONMENT_FROM_TEMPLATE_DESCRIPTION}, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, data: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR, description: UserInputUtil.ADD_ENVIRONMENT_FROM_DIR_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, data: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS, description: UserInputUtil.ADD_ENVIRONMENT_FROM_OPS_TOOLS_DESCRIPTION }, { label: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, data: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES, description: UserInputUtil.ADD_ENVIRONMENT_FROM_NODES_DESCRIPTION }]);
        //     showQuickPickItemStub.should.have.been.calledWithExactly('Choose a configuration for a new local network', [{label: UserInputUtil.ONE_ORG_TEMPLATE, data: 1}, {label: UserInputUtil.TWO_ORG_TEMPLATE, data: 2}]);
        //     showInputBoxStub.should.not.have.been.calledOnceWithExactly(`Enter a name for the environment`);
        //     initializeSpy.should.not.have.been.called;
        //     getRuntimeSpy.should.not.have.been.called;

        //     executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.IMPORT_NODES_TO_ENVIRONMENT, sinon.match.instanceOf(FabricEnvironmentRegistryEntry));

        //     const extPath: string = ExtensionUtil.getExtensionPath();
        //     const tutorialPath: string = path.join(extPath, 'packages', 'blockchain-extension', 'tutorials', 'developer-tutorials', 'create-additional-local-networks.md');

        //     const executeCallOne: sinon.SinonSpyCall = executeCommandStub.getCall(1);
        //     executeCallOne.should.have.been.calledWith('markdown.showPreview', sinon.match.any);
        //     executeCallOne.args[1].path.should.equal(tutorialPath);

        //     deleteEnvironmentSpy.should.have.not.been.called;
        //     logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'Add environment');
        //     logSpy.should.not.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new environment');
        //     sendTelemetryEventStub.should.not.have.been.calledOnceWithExactly('addEnvironmentCommand');
        // });
    });
});
