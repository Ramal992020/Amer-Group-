/** Managers use the Portsaid heading; sales retain their existing statement. */
export function attendanceStatement(name: string, branch: 'SITE' | 'RESTA', time: string, isManager?: boolean): string {
  if (isManager) {
    const branchName = branch === 'SITE' ? 'Site' : 'Resta';
    return `Portsaid (${branchName})\n\nName : ${name}\n\nTime : ${time}`;
  }
  return `NAME : ${name}\nBRANCH : ${branch}\nTIME : ${time}`;
}
