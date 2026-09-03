import StartNode from "./StartNode";
import EndNode from "./EndNode";
import TaskNode from "./TaskNode";
import DatabaseNode from "./DatabaseNode";
import BranchNode from "./BranchNode";
import MemoNode from "./MemoNode";
import ApprovalNode from "./ApprovalNode";
import DocumentNode from "./DocumentNode";
import NotificationNode from "./NotificationNode";
import WaitNode from "./WaitNode";
import SubflowNode from "./SubflowNode";

export const nodeTypes = {
  start: StartNode,
  end: EndNode,
  task: TaskNode,
  database: DatabaseNode,
  branch: BranchNode,
  memo: MemoNode,
  approval: ApprovalNode,
  document: DocumentNode,
  notification: NotificationNode,
  wait: WaitNode,
  subflow: SubflowNode,
};
