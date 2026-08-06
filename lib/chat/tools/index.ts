import 'server-only'

import type { ToolSet } from 'ai'
import type { ChatToolContext } from './shared'
import { createQueryEventsTool } from './query-events'
import { createDisplayWorkItemsTool } from './display-work-items'
import { createDisplayTeamTool } from './display-team'
import { createGetBlockersTool } from './get-blockers'
import { createSearchKnowledgeTool } from './search-knowledge'
import { createListWorkItemsTool } from './list-work-items'
import { createGetWorkItemTool } from './get-work-item'
import { createListDocsTool } from './list-docs'
import { createGetDocTool } from './get-doc'
import { createListProjectsTool } from './list-projects'
import { createListTeamsTool } from './list-teams'
import { createListMembersTool } from './list-members'
import { createCreateWorkItemTool } from './create-work-item'
import { createUpdateWorkItemTool } from './update-work-item'
import { createAddRelationTool } from './add-relation'
import { createAddCommentTool } from './add-comment'
import { createCreateDocTool } from './create-doc'
import { createUpdateDocTool } from './update-doc'
import { createMoveDocTool } from './move-doc'
import { createAddDocTaskTool } from './add-doc-task'
import { createToggleDocTaskTool } from './toggle-doc-task'

export function buildChatTools(toolCtx: ChatToolContext): ToolSet {
  return {
    query_events: createQueryEventsTool(toolCtx),
    display_work_items: createDisplayWorkItemsTool(toolCtx),
    display_team: createDisplayTeamTool(toolCtx),
    get_blockers: createGetBlockersTool(toolCtx),
    search_knowledge: createSearchKnowledgeTool(toolCtx),
    list_work_items: createListWorkItemsTool(toolCtx),
    get_work_item: createGetWorkItemTool(toolCtx),
    list_docs: createListDocsTool(toolCtx),
    get_doc: createGetDocTool(toolCtx),
    list_projects: createListProjectsTool(toolCtx),
    list_teams: createListTeamsTool(toolCtx),
    list_members: createListMembersTool(toolCtx),
    create_work_item: createCreateWorkItemTool(toolCtx),
    update_work_item: createUpdateWorkItemTool(toolCtx),
    add_relation: createAddRelationTool(toolCtx),
    add_comment: createAddCommentTool(toolCtx),
    create_doc: createCreateDocTool(toolCtx),
    update_doc: createUpdateDocTool(toolCtx),
    move_doc: createMoveDocTool(toolCtx),
    add_doc_task: createAddDocTaskTool(toolCtx),
    toggle_doc_task: createToggleDocTaskTool(toolCtx),
  }
}
